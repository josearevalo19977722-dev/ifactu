import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { AuthMhService } from '../../auth-mh/auth-mh.service';
import { TransmitterService } from './transmitter.service';
import { SignerService } from './signer.service';
import { ConsultaMhService } from './consulta-mh.service';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { getAmbiente, getMhUrls, isModoDemo, getNitEmisor } from './mh-config.helper';

export interface EventoContingencia {
  codigoEvento: string;
  estado: string;
  observaciones?: string[];
}

/**
 * Manual MH sección 3.4: horarios de recepción de lotes normales.
 * Para lotes de contingencia el horario es 24/7/365 (sección 3.4.iii).
 * Los horarios aplican solo para lotes de facturación cíclica.
 *
 * Pruebas:    08:00–17:00 CST
 * Producción: 22:00–05:00 CST (día siguiente)
 */
const HORARIO_LOTES = {
  pruebas:    { inicio: 8,  fin: 17 },
  produccion: { inicio: 22, fin: 5  },
};

@Injectable()
export class ContingenciaService {
  private readonly logger = new Logger(ContingenciaService.name);

  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly authMh: AuthMhService,
    private readonly transmitter: TransmitterService,
    private readonly signer: SignerService,
    private readonly consultaMh: ConsultaMhService,
    private readonly empresaService: EmpresaService,
  ) {}

  /**
   * Retorna todos los DTEs en estado CONTINGENCIA para una empresa.
   */
  async obtenerCola(empresaId: string): Promise<Dte[]> {
    return this.dteRepo.find({
      where: { estado: EstadoDte.CONTINGENCIA, empresa: { id: empresaId } },
      order: { createdAt: 'ASC' },
    });
  }

  /** Superadmin: todos los DTEs en CONTINGENCIA o PENDIENTE de todas las empresas */
  async obtenerColaGlobal(): Promise<Dte[]> {
    return this.dteRepo.find({
      where: [
        { estado: EstadoDte.CONTINGENCIA },
        { estado: EstadoDte.PENDIENTE },
      ],
      relations: ['empresa'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Registra el evento de contingencia en el MH y luego envía el lote de DTEs pendientes.
   *
   * Flujo según Manual MH sección 3.2:
   *   1. POST /fesv/contingencia  → codigoEvento
   *   2. POST /fesv/recepcionlote con los DTEs re-firmados
   *   3. Guardar codigoLote para consulta posterior (el MH procesa en 2-3 min)
   *
   * Los lotes de contingencia se aceptan 24/7/365 (sección 3.4.iii).
   */
  async procesarCola(
    tipoContingencia: number,
    motivoContingencia: string,
    empresaId: string,
  ): Promise<{ enviados: number; fallidos: number; codigosLote: string[] }> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');

    const cola = await this.obtenerCola(empresaId);
    if (cola.length === 0) {
      return { enviados: 0, fallidos: 0, codigosLote: [] };
    }

    // Paso 1: registrar el evento de contingencia (omitido en modo demo)
    let codigoEvento: string | null = null;
    if (!isModoDemo(this.config)) {
      try {
        codigoEvento = await this.registrarEvento(cola, tipoContingencia, motivoContingencia, empresa);
        this.logger.log(`Evento de contingencia registrado: ${codigoEvento}`);
      } catch (err) {
        this.logger.warn(`No se pudo registrar evento de contingencia: ${err.message}`);
        // Sin codigoEvento válido el lote será rechazado — propagar el error
        throw new Error(`Error registrando evento de contingencia: ${err.message}`);
      } finally {
        // El endpoint /contingencia consume el token; invalidar para que enviarLote obtenga uno fresco
        this.authMh.invalidarToken(empresa.id);
      }
    } else {
      this.logger.warn('[MODO DEMO] Registro de evento de contingencia omitido');
    }

    // Paso 2: enviar por lotes de máximo 100 documentos
    let enviados = 0;
    let fallidos = 0;
    const codigosLote: string[] = [];

    // Modo demo: simular envío de lote sin conectarse al MH real
    const esDemo = isModoDemo(this.config);

    const lotes = this.chunk(cola, 100);
    for (const lote of lotes) {
      try {
        let codigoLote: string;
        if (esDemo) {
          codigoLote = `DEMO-LOTE-${Date.now()}`;
          this.logger.warn(`[MODO DEMO] Lote simulado: ${codigoLote}`);
        } else {
          codigoLote = await this.enviarLote(lote, codigoEvento, tipoContingencia, motivoContingencia, empresa);
        }
        codigosLote.push(codigoLote);

        // El MH procesa el lote en 2-3 min de forma asíncrona (sección 3.2.1).
        // Marcamos PENDIENTE y guardamos codigoLote para consultar después.
        for (const dte of lote) {
          dte.estado = EstadoDte.PENDIENTE;
          dte.observaciones = `Lote de contingencia enviado — codigoLote: ${codigoLote}`;
          await this.dteRepo.save(dte);
        }
        enviados += lote.length;
        this.logger.log(`Lote enviado: ${codigoLote} con ${lote.length} DTEs`);
      } catch (err) {
        this.logger.error(`Fallo al enviar lote de ${lote.length} DTEs: ${err.message}`);
        fallidos += lote.length;
        
        // Guardar el error en las observaciones para visibilidad del usuario
        for (const dte of lote) {
          dte.observaciones = `Error en transmisión: ${err.message}`;
          await this.dteRepo.save(dte);
        }
      }
    }

    return { enviados, fallidos, codigosLote };
  }

  /**
   * Consulta el estado de un lote de contingencia en el MH y actualiza los DTEs locales.
   * Manual MH sección 4.3.2: GET /fesv/recepcion/consultalote/{codigoLote}
   * El MH procesa un lote de 100 DTEs en promedio 2-3 minutos.
   */
  async consultarResultadoLote(
    codigoLote: string,
    empresaId: string,
  ): Promise<{ actualizados: number; rechazados: number; pendientes: number }> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');

    // En modo demo (o lotes simulados) marcamos todos los DTEs del lote como RECIBIDO directamente
    const esDemo = isModoDemo(this.config) || codigoLote.startsWith('DEMO-LOTE-');
    if (esDemo) {
      this.logger.warn(`[MODO DEMO] Simulando confirmación de lote ${codigoLote}`);
      const dtesPendientes = await this.dteRepo.find({
        where: {
          estado: EstadoDte.PENDIENTE,
          empresa: { id: empresaId },
        },
      });
      // Encontrar los DTEs de este lote específico (por observaciones)
      const dtesDelLote = dtesPendientes.filter(
        (d) => d.observaciones?.includes(codigoLote),
      );
      let actualizados = 0;
      for (const dte of dtesDelLote) {
        dte.estado         = EstadoDte.RECIBIDO;
        dte.selloRecepcion = `DEMO-SELLO-${Date.now()}`;
        dte.fhProcesamiento = new Date().toISOString().replace('T', ' ').slice(0, 19);
        dte.clasificaMsg   = '10';    // mismo que transmitter.service en modo demo
        dte.codigoMsg      = '001';   // 001 = RECIBIDO
        dte.descripcionMsg = 'ACEPTADO (MODO DEMO)';
        dte.observaciones  = null;
        await this.dteRepo.save(dte);
        actualizados++;
      }
      const pendientesRestantes = await this.dteRepo.count({
        where: { estado: EstadoDte.PENDIENTE, empresa: { id: empresaId } },
      });
      this.logger.log(`[MODO DEMO] Lote ${codigoLote}: ${actualizados} marcados RECIBIDO`);
      return { actualizados, rechazados: 0, pendientes: pendientesRestantes };
    }

    const resultado = await this.consultaMh.consultarLote(codigoLote, empresa);

    let actualizados = 0;
    let rechazados   = 0;

    // Actualizar DTEs procesados con su sello de recepción
    for (const p of resultado.procesados) {
      const dte = await this.dteRepo.findOne({
        where: { codigoGeneracion: p.codigoGeneracion, empresa: { id: empresaId } },
      });
      if (dte) {
        dte.estado         = EstadoDte.RECIBIDO;
        dte.selloRecepcion = p.selloRecepcion ?? null;
        dte.fhProcesamiento = p.fhProcesamiento ?? null;
        dte.clasificaMsg   = p.clasificaMsg ?? null;
        dte.codigoMsg      = p.codigoMsg ?? null;
        dte.descripcionMsg = p.descripcionMsg ?? null;
        dte.observaciones  = null;
        await this.dteRepo.save(dte);
        actualizados++;
      }
    }

    // Marcar rechazados para revisión manual
    for (const r of resultado.rechazados) {
      const dte = await this.dteRepo.findOne({
        where: { codigoGeneracion: r.codigoGeneracion, empresa: { id: empresaId } },
      });
      if (dte) {
        dte.estado         = EstadoDte.RECHAZADO;
        dte.clasificaMsg   = r.clasificaMsg ?? null;
        dte.codigoMsg      = r.codigoMsg ?? null;
        dte.descripcionMsg = r.descripcionMsg ?? null;
        dte.observaciones  = `Rechazado en lote ${codigoLote}: ${r.descripcionMsg}`;
        await this.dteRepo.save(dte);
        rechazados++;
      }
    }

    // DTEs que aún no aparecen en la respuesta del MH (lote en proceso)
    const totalLote    = resultado.procesados.length + resultado.rechazados.length;
    const pendientesLote = await this.dteRepo.count({
      where: {
        estado: EstadoDte.PENDIENTE,
        empresa: { id: empresaId },
      },
    });

    this.logger.log(`Lote ${codigoLote}: ${actualizados} recibidos, ${rechazados} rechazados, ~${pendientesLote} aún pendientes`);
    return { actualizados, rechazados, pendientes: pendientesLote };
  }

  /**
   * Reintenta transmitir un DTE individual en CONTINGENCIA.
   */
  async reintentarIndividual(id: string): Promise<Dte> {
    const dte = await this.dteRepo.findOneOrFail({ where: { id }, relations: ['empresa'] });
    if (dte.estado !== EstadoDte.CONTINGENCIA) {
      return dte;
    }

    let jsonFirmado: object;
    try {
      jsonFirmado = JSON.parse(dte.firmado ?? '{}');
    } catch {
      this.logger.error(`No se pudo parsear el DTE firmado para ${dte.codigoGeneracion}`);
      return dte;
    }

    try {
      const respuesta = await this.transmitter.transmitir(
        dte.tipoDte,
        dte.codigoGeneracion,
        jsonFirmado,
        dte.empresa,
      );
      dte.estado         = respuesta.estado === 'RECIBIDO' ? EstadoDte.RECIBIDO : EstadoDte.RECHAZADO;
      dte.selloRecepcion = respuesta.selloRecepcion ?? null;
      dte.observaciones  = respuesta.observaciones?.join(', ') ?? null;
      dte.clasificaMsg   = respuesta.clasificaMsg ?? null;
      dte.codigoMsg      = respuesta.codigoMsg ?? null;
      dte.descripcionMsg = respuesta.descripcionMsg ?? null;
      dte.fhProcesamiento = respuesta.fhProcesamiento ?? null;
    } catch (err) {
      this.logger.error(`Reintento fallido para ${dte.codigoGeneracion}: ${err.message}`);
      dte.observaciones = err.message;
    }

    return this.dteRepo.save(dte);
  }

  // ── Privado ────────────────────────────────────────────────────────────────

  private async registrarEvento(
    dtes: Dte[],
    tipoContingencia: number,
    motivoContingencia: string,
    empresa: Empresa,
  ): Promise<string> {
    const url      = getMhUrls(empresa, this.config).contingencia;
    const nit      = getNitEmisor(empresa);
    const token    = await this.authMh.getToken(empresa);
    const ambiente = getAmbiente(empresa, this.config);

    // Calcular rango real de fechas y horas del lote (punto 7)
    const fechasEmision = dtes.map((d) => d.fechaEmision).sort();
    const fInicio = fechasEmision[0];
    const fFin    = fechasEmision[fechasEmision.length - 1];

    // Obtener hora real del primer y último DTE en contingencia
    const horaInicio = this.extraerHora(dtes[0].createdAt);
    const horaFin    = this.extraerHora(dtes[dtes.length - 1].createdAt);

    const payload = {
      nit,
      tipoContingencia,
      motivoContingencia,
      fechaInicio: fInicio,
      fechaFin:    fFin,
      horaInicio,
      horaFin,
      cantidadDoc: dtes.length,
      tipoDocumentos: [...new Set(dtes.map((d) => d.tipoDte))],
      codEvento: uuidv4().toUpperCase(),
    };

    this.logger.log(`registrarEvento payload: ${JSON.stringify(payload)}`);

    let data: any;
    try {
      ({ data } = await firstValueFrom(
        this.http.post(url, payload, {
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
            nitEmisor: nit,
            'User-Agent': 'facturacion-dte/1.0',
          },
          params: { ambiente },
          timeout: 15000,
        }),
      ));
    } catch (err) {
      const body = err.response?.data;
      this.logger.error(`registrarEvento HTTP ${err.response?.status}: ${JSON.stringify(body ?? err.message)}`);
      throw err;
    }

    this.logger.log(`registrarEvento respuesta: ${JSON.stringify(data)}`);
    // Hacienda puede devolver el código en data.body o directamente en data
    const codigo = data.body?.codigoEvento ?? data.codigoEvento ?? data.body?.codEvento ?? data.codEvento ?? '';
    if (!codigo) this.logger.warn(`registrarEvento: respuesta sin codigoEvento — ${JSON.stringify(data)}`);
    return codigo;
  }

  private async enviarLote(
    dtes: Dte[],
    codigoEvento: string | null,
    tipoContingencia: number,
    motivoContingencia: string,
    empresa: Empresa,
  ): Promise<string> {
    const url      = getMhUrls(empresa, this.config).lote;
    const nit      = getNitEmisor(empresa);
    let   token    = await this.authMh.getToken(empresa);
    const ambiente = getAmbiente(empresa, this.config);

    // Punto 8: validar horario de recepción para lotes normales.
    // Los lotes de contingencia están exentos (24/7), pero los documentamos igual.
    this.validarHorarioLote(ambiente);

    const documentos = await Promise.all(dtes.map(async (dte) => {
      // Manual MH sección 3.2: en modo contingencia tipoOperacion=2, tipoContingencia y motivoContin requeridos
      const json = { ...dte.jsonDte as any };
      if (!json.identificacion) json.identificacion = {};
      json.identificacion.tipoOperacion    = 2;  // ← contingencia
      json.identificacion.tipoContingencia = tipoContingencia;
      json.identificacion.motivoContin     = motivoContingencia;

      // Re-firmar con los campos de contingencia actualizados
      const firmado = await this.signer.firmar(json, empresa);

      // El MH espera el JWS string directamente (igual que para DTEs individuales)
      // firmado puede ser { body: "JWS..." } (Docker) o el JWS string directo
      const jwsStr = typeof firmado === 'string'
        ? firmado
        : (firmado as any).body ?? JSON.stringify(firmado);

      return {
        codigoGeneracion: dte.codigoGeneracion,
        tipoDte:          dte.tipoDte,
        documento:        jwsStr,
      };
    }));

    const payload: Record<string, unknown> = {
      ambiente,
      idLote:      uuidv4().toUpperCase(),
      cantidadDoc: dtes.length,
      version:     1,
      documentos,
    };

    if (codigoEvento) {
      payload.codigoEvento = codigoEvento;
    }

    const enviar = () => firstValueFrom(
      this.http.post(url, payload, {
        headers: {
          Authorization: token.trim(),
          'Content-Type': 'application/json',
          nitEmisor: nit,
          'User-Agent': 'facturacion-dte/1.0',
        },
        timeout: 30000,
      }),
    );

    const ejecutar = async () => {
      try {
        return (await enviar()).data;
      } catch (err) {
        const status = err.response?.status;
        const body   = err.response?.data;
        this.logger.error(`enviarLote HTTP ${status}: ${JSON.stringify(body ?? err.message)}`);
        if (status === 401) {
          this.logger.warn('Lote — 401, reautenticando...');
          this.authMh.invalidarToken(empresa.id);
          token = await this.authMh.getToken(empresa);
          try {
            return (await enviar()).data;
          } catch (err2) {
            const b = err2.response?.data;
            this.logger.error(`enviarLote retry HTTP ${err2.response?.status}: ${JSON.stringify(b ?? err2.message)}`);
            const msg = b?.descripcionMsg ?? b?.mensaje ?? b?.message ?? err2.message;
            // 401 sin body = API rechaza fuera del horario permitido (08:00–17:00 pruebas / 22:00–05:00 prod)
            const extra = (!b || b === '') ? ' — El endpoint /recepcionlote de pruebas solo acepta envíos entre 08:00 y 17:00 CST' : '';
            throw new Error(msg + extra);
          }
        }
        const msg = body?.descripcionMsg ?? body?.mensaje ?? body?.message ?? err.message;
        throw new Error(msg);
      }
    };
    let data: any = await ejecutar();

    // Manual MH sección 3.2.1: la respuesta contiene codigoLote para consulta posterior
    return data.codigoLote ?? data.idEnvio ?? 'desconocido';
  }

  /**
   * Punto 8: Valida que la hora actual esté dentro del horario permitido para envío de lotes.
   * Los lotes de CONTINGENCIA están exentos de horario (24/7/365) — sección 3.4.iii.
   * Esta validación es solo informativa y no bloquea contingencias.
   */
  private validarHorarioLote(ambiente: string): void {
    const esPruebas = ambiente === '00';
    const horario   = esPruebas ? HORARIO_LOTES.pruebas : HORARIO_LOTES.produccion;
    const horaActual = new Date().getHours();

    let dentroDeHorario: boolean;
    if (horario.inicio < horario.fin) {
      // Rango simple: 08-17
      dentroDeHorario = horaActual >= horario.inicio && horaActual < horario.fin;
    } else {
      // Rango que cruza medianoche: 22-05
      dentroDeHorario = horaActual >= horario.inicio || horaActual < horario.fin;
    }

    if (!dentroDeHorario) {
      const rango = `${String(horario.inicio).padStart(2, '0')}:00–${String(horario.fin).padStart(2, '0')}:00`;
      this.logger.warn(
        `Envío de lote fuera del horario permitido (${rango} ${esPruebas ? 'pruebas' : 'producción'}). ` +
        `Los lotes de contingencia se aceptan 24/7.`,
      );
    }
  }

  /**
   * Extrae la hora en formato HH:MM:SS en zona horaria de El Salvador (UTC-6, sin DST).
   */
  private extraerHora(fecha: Date | string): string {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    const SV_OFFSET_MS = -6 * 60 * 60 * 1000;
    const svDate = new Date(d.getTime() + SV_OFFSET_MS);
    return svDate.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}
