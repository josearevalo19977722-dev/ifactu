import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Empresa } from '../empresa/entities/empresa.entity';
import { Dte, EstadoDte } from '../dte/entities/dte.entity';
import { AuthMhService } from '../auth-mh/auth-mh.service';
import { CfService } from '../dte/services/cf.service';
import { CcfService } from '../dte/services/ccf.service';
import { FseService } from '../dte/services/fse.service';
import { FexeService } from '../dte/services/fexe.service';
import { RetencionService } from '../dte/services/retencion.service';
import { DonacionService } from '../dte/services/donacion.service';
import { NotaService } from '../dte/services/nota.service';
import { InvalidacionService } from '../dte/services/invalidacion.service';
import { ContingenciaService } from '../dte/services/contingencia.service';
import { ConfigService } from '@nestjs/config';
import { getAmbiente } from '../dte/services/mh-config.helper';

export interface TestConexionResult {
  exitoso: boolean;
  mensaje: string;
  tiempoMs: number;
  ambiente: string;
}

export interface TestDteResult {
  exitoso: boolean;
  tipoDte: string;
  codigoGeneracion?: string;
  estado?: string;
  selloRecepcion?: string;
  observaciones?: string[];
  descripcionMsg?: string;
  error?: string;
  tiempoMs: number;
  invalidado?: boolean;
  detalleInvalidacion?: string;
}

export interface LoteJob {
  jobId: string;
  tipoDte: string;
  total: number;
  completados: number;
  exitosos: number;
  fallidos: number;
  resultados: TestDteResult[];
  terminado: boolean;
  error?: string;
}

@Injectable()
export class TestMhService {
  private readonly logger = new Logger(TestMhService.name);
  private readonly jobs = new Map<string, LoteJob>();

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly authMh: AuthMhService,
    private readonly cfService: CfService,
    private readonly ccfService: CcfService,
    private readonly fseService: FseService,
    private readonly fexeService: FexeService,
    private readonly retencionService: RetencionService,
    private readonly donacionService: DonacionService,
    private readonly notaService: NotaService,
    private readonly invalidacionService: InvalidacionService,
    private readonly contingenciaService: ContingenciaService,
    private readonly config: ConfigService,
  ) {}

  // ── Conexión ─────────────────────────────────────────────────────────────

  async probarConexion(empresaId: string): Promise<TestConexionResult> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    const ambiente = getAmbiente(empresa, this.config);
    const inicio = Date.now();
    try {
      this.authMh.invalidarToken(empresaId);
      await this.authMh.getToken(empresa);
      return { exitoso: true, mensaje: `Conexión exitosa con el Ministerio de Hacienda (pruebas)`, tiempoMs: Date.now() - inicio, ambiente };
    } catch (err: any) {
      return { exitoso: false, mensaje: err.message ?? 'Error desconocido', tiempoMs: Date.now() - inicio, ambiente };
    }
  }

  // ── DTE individual ────────────────────────────────────────────────────────

  async probarDte(empresaId: string, tipoDte: string, receptorOverride?: Record<string, any>, invalidar = false): Promise<TestDteResult> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    const raw = await this.emitirDtePrueba(empresa, tipoDte, receptorOverride) as TestDteResult & { _dteId?: string };
    if (invalidar && raw.exitoso && raw._dteId) {
      try {
        // Emitir CF de reemplazo (Hacienda requiere codigoGeneracionR cuando tipoAnulacion=1)
        const cfReemplazo = await this.cfService.emitir(this.dtoCf(), empresaId);
        await this.invalidacionService.anular({
          dteId: raw._dteId,
          tipoAnulacion: 1,
          motivoAnulacion: 'Prueba de evento de invalidación iFactu',
          nombreResponsable: 'RESPONSABLE PRUEBA IFACTU',
          tipDocResponsable: '13',
          numDocResponsable: '00000000-0',
          codigoGeneracionR: cfReemplazo.estado === EstadoDte.RECIBIDO ? cfReemplazo.codigoGeneracion : undefined,
        }, empresaId);
        raw.invalidado = true;
        raw.detalleInvalidacion = 'DTE invalidado correctamente';
      } catch (err: any) {
        this.logger.warn(`Error al invalidar DTE de prueba: ${err.message}`);
        raw.invalidado = false;
        raw.detalleInvalidacion = err.message || err?.response?.message || 'Error desconocido al invalidar';
      }
      delete raw._dteId;
    }
    return raw;
  }

  // ── Lote ─────────────────────────────────────────────────────────────────

  async iniciarLote(empresaId: string, tipoDte: string, cantidad: number, receptorOverride?: Record<string, any>): Promise<string> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    const jobId = uuidv4();
    const job: LoteJob = { jobId, tipoDte, total: cantidad, completados: 0, exitosos: 0, fallidos: 0, resultados: [], terminado: false };
    this.jobs.set(jobId, job);
    this.procesarLote(empresa, tipoDte, cantidad, job, receptorOverride).catch(err => { job.terminado = true; job.error = err.message; });
    return jobId;
  }

  consultarLote(jobId: string): LoteJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  private async procesarLote(empresa: Empresa, tipoDte: string, cantidad: number, job: LoteJob, receptorOverride?: Record<string, any>): Promise<void> {
    for (let i = 0; i < cantidad; i++) {
      const r = await this.emitirDtePrueba(empresa, tipoDte, receptorOverride);
      job.resultados.push(r);
      job.completados++;
      if (r.exitoso) job.exitosos++; else job.fallidos++;
    }
    job.terminado = true;
  }

  // ── Core: usa los servicios reales de producción ──────────────────────────

  private async emitirDtePrueba(empresa: Empresa, tipoDte: string, receptorOverride?: Record<string, any>): Promise<TestDteResult> {
    const inicio = Date.now();
    try {
      let resultado: any;
      switch (tipoDte) {
        case '01': resultado = await this.cfService.emitir(this.dtoCf(),                              empresa.id); break;
        case '03': resultado = await this.ccfService.emitir(this.dtoCcf(empresa, receptorOverride),   empresa.id); break;
        case '05':
        case '06': resultado = await this.emitirNotaPrueba(empresa, tipoDte, receptorOverride); break;
        case '14': resultado = await this.fseService.emitir(this.dtoFse(receptorOverride),            empresa.id); break;
        case '11': resultado = await this.fexeService.emitir(this.dtoFexe(receptorOverride),          empresa.id); break;
        case '07': resultado = await this.retencionService.emitir(this.dtoRetencion(empresa, receptorOverride), empresa.id); break;
        case '15': resultado = await this.donacionService.emitir(this.dtoDonacion(empresa, receptorOverride),   empresa.id); break;
        default:   resultado = await this.cfService.emitir(this.dtoCf(),                              empresa.id);
      }
      return {
        exitoso: resultado.estado === 'RECIBIDO',
        tipoDte,
        codigoGeneracion: resultado.codigoGeneracion,
        estado: resultado.estado,
        selloRecepcion: resultado.selloRecepcion,
        observaciones: resultado.observaciones,
        descripcionMsg: resultado.descripcionMsg,
        tiempoMs: Date.now() - inicio,
        _dteId: resultado.id,
      } as any;
    } catch (err: any) {
      return { exitoso: false, tipoDte, error: err.message ?? 'Error desconocido', tiempoMs: Date.now() - inicio };
    }
  }

  // ── NC/ND: requieren un CCF de referencia — emitimos uno primero ─────────

  private async emitirNotaPrueba(empresa: Empresa, tipoDte: '05' | '06', o?: Record<string, any>): Promise<any> {
    const faltantes = ['nrc','codActividad','tipoEstablecimiento','departamento','municipio','complemento'].filter(k => !(empresa as any)[k]);
    if (faltantes.length) throw new Error(`Empresa incompleta para CCF: faltan ${faltantes.join(', ')}. Configúrelos en la empresa antes de probar NC/ND.`);
    let ccf: any;
    try {
      ccf = await this.ccfService.emitir(this.dtoCcf(empresa, o), empresa.id);
    } catch (err: any) {
      throw new Error(`No se pudo emitir CCF de referencia: ${err.message ?? err}`);
    }
    if (ccf.estado !== EstadoDte.RECIBIDO) {
      this.logger.warn(`CCF ref rechazado: descripcionMsg=${ccf.descripcionMsg} | observaciones=${ccf.observaciones}`);
      const detalle = [ccf.descripcionMsg, ccf.observaciones].filter(Boolean).join(' | ') || 'sin detalles';
      throw new Error(`CCF de referencia rechazado: ${detalle}`);
    }
    const dto = {
      dteReferenciadoId: ccf.id,
      tipoAjuste: 1,
      motivoAjuste: tipoDte === '05' ? 'Descuento de prueba iFactu' : 'Cargo adicional de prueba iFactu',
      items: [{ numItem: 1, tipoItem: 2, cantidad: 1, codigo: 'TEST-001', uniMedida: 59, descripcion: 'Ajuste de prueba iFactu', precioUni: 1.00, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 1.00 }],
    };
    return tipoDte === '05'
      ? this.notaService.emitirNc(dto, empresa.id)
      : this.notaService.emitirNd(dto, empresa.id);
  }

  // ── DTOs mínimos de prueba ────────────────────────────────────────────────

  private dtoCf() {
    return {
      condicionOperacion: 1,
      items: [{ numItem: 1, tipoItem: 2, cantidad: 1, codigo: 'TEST-001', uniMedida: 59, descripcion: 'Servicio de prueba iFactu', precioUni: 1.13, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 1.13 }],
      pagos: [{ codigo: '01' as any, montoPago: 1.13 }],
    };
  }

  private dtoCcf(empresa: Empresa, o?: Record<string, any>) {
    const nit = o?.nit?.replace(/-/g, '') ?? '12171108580023';
    const nrc = o?.nrc?.replace(/-/g, '') ?? '771120';
    return {
      condicionOperacion: 1,
      receptor: {
        nit, nrc,
        nombre: o?.nombre ?? 'RECEPTOR DE PRUEBA S.A. DE C.V.',
        correo: o?.correo ?? 'receptor.prueba@test.com',
        telefono: o?.telefono ?? '22000000',
        codActividad: empresa.codActividad ?? '46900',
        descActividad: empresa.descActividad ?? 'Venta al por mayor no especializada',
        direccionDepartamento: empresa.departamento ?? '06',
        direccionMunicipio: empresa.municipio ?? '14',
        direccionComplemento: empresa.complemento ?? 'Dirección de prueba',
      },
      items: [{ numItem: 1, tipoItem: 2, cantidad: 1, codigo: 'TEST-001', uniMedida: 59, descripcion: 'Servicio de prueba iFactu', precioUni: 1.00, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 1.00 }],
      pagos: [{ codigo: '01' as any, montoPago: 1.13 }],
    };
  }

  private dtoFse(o?: Record<string, any>) {
    return {
      condicionOperacion: 1,
      receptor: {
        tipoDocumento: o?.tipoDocumento ?? '13',
        numDocumento: o?.numDocumento ?? '00000000-0',
        nombre: o?.nombre ?? 'SUJETO EXCLUIDO DE PRUEBA',
        codActividad: '46900',
        direccionDepartamento: '06',
        direccionMunicipio: '14',
        direccionComplemento: 'Dirección de prueba',
        correo: o?.correo ?? 'prueba@test.com',
        telefono: o?.telefono ?? '00000000',
      },
      items: [{ numItem: 1, tipoItem: 2, cantidad: 1, codigo: 'TEST-001', uniMedida: 59, descripcion: 'Servicio de prueba iFactu', precioUni: 1.00, montoDescu: 0, compra: 1.00 }],
      pagos: [{ codigo: '01' as any, montoPago: 1.00 }],
    };
  }

  private dtoFexe(o?: Record<string, any>) {
    return {
      condicionOperacion: 1,
      tipoExportacion: 1,
      receptor: {
        tipoPersona: 1,
        nombre: o?.nombre ?? 'TEST FOREIGN BUYER',
        codPais: o?.codPais ?? 'US',
        nombrePais: o?.nombrePais ?? 'Estados Unidos',
        tipoDocumento: o?.tipoDocumento ?? '37',
        numDocumento: o?.numDocumento ?? '000000000',
        complemento: '123 Test St',
        correo: o?.correo ?? 'buyer@test.com',
        telefono: o?.telefono ?? '00000000',
      },
      items: [{ numItem: 1, tipoItem: 2, cantidad: 1, codigo: 'TEST-001', uniMedida: 59, descripcion: 'Exported service iFactu test', precioUni: 1.00, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 1.00, noGravado: 0 }],
      pagos: [{ codigo: '01' as any, montoPago: 1.00 }],
      codIncoterms: 'EXW', descIncoterms: 'En fábrica', flete: 0, seguro: 0,
    };
  }

  private dtoRetencion(empresa: Empresa, o?: Record<string, any>) {
    const nit = o?.nit?.replace(/-/g, '') ?? '12171108580023';
    const nrc = o?.nrc?.replace(/-/g, '') ?? '771120';
    const hoy = new Date();
    return {
      periodo: hoy.getMonth() + 1,
      anio: hoy.getFullYear(),
      receptor: {
        nit, nrc,
        nombre: o?.nombre ?? 'RETENIDO DE PRUEBA S.A.',
        correo: o?.correo ?? 'retenido.prueba@test.com',
        telefono: o?.telefono ?? '22000000',
        codActividad: empresa.codActividad ?? '46900',
        descActividad: empresa.descActividad ?? 'Venta al por mayor no especializada',
        direccionDepartamento: empresa.departamento ?? '06',
        direccionMunicipio: empresa.municipio ?? '14',
        direccionComplemento: empresa.complemento ?? 'Dirección de prueba',
      },
      items: [{ numItem: 1, tipoDteRelacionado: '01', tipo: 1, numDocumento: uuidv4().toUpperCase(), fechaDocumento: hoy.toISOString().split('T')[0], montoSujetoGrav: 1.13, compraNoSujetaIVA: 0, compraExentaIVA: 0, compraAfectaIVA: 1.13, porcentajeRenta: 10, ivaRetenido: 0.13, descripcion: 'Retención de prueba iFactu' }],
    };
  }

  private dtoDonacion(empresa: Empresa, o?: Record<string, any>) {
    return {
      condicionOperacion: 1,
      donatario: {
        tipoDocumento: o?.tipoDocumento ?? '36',
        numDocumento: o?.numDocumento ?? '12171108580023',
        nombre: o?.nombre ?? 'DONATARIO DE PRUEBA S.A.',
        tipoEstablecimiento: '01',
        direccionDepartamento: '06',
        direccionMunicipio: '14',
        direccionComplemento: 'Dirección de prueba',
        telefono: o?.telefono ?? '00000000',
        correo: o?.correo ?? 'donatario@test.com',
        codEstableMH: empresa.codEstableMh ?? 'M001',
        codPuntoVentaMH: empresa.codPuntoVentaMh ?? 'P001',
      },
      receptor: { nombre: o?.nombre ?? 'RECEPTOR DONACIÓN PRUEBA', correo: o?.correo ?? 'donacion@test.com', telefono: o?.telefono ?? '00000000' },
      items: [{ numItem: 1, tipoDonacion: 1, cantidad: 1, codigo: 'DON-001', uniMedida: 59, descripcion: 'Donación de prueba iFactu', valorUni: 1.00, montoDescu: 0, depreciacion: 0, valor: 1.00 }],
    };
  }

  // ── Invalidación ─────────────────────────────────────────────────────────

  async probarInvalidacion(empresaId: string): Promise<{ exitoso: boolean; detalle: string; tiempoMs: number }> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    const inicio = Date.now();
    try {
      // 1. Emitir CF a invalidar
      const cf1 = await this.cfService.emitir(this.dtoCf(), empresa.id);
      if (cf1.estado !== EstadoDte.RECIBIDO) {
        throw new Error(`CF a invalidar rechazado: ${cf1.descripcionMsg ?? cf1.observaciones ?? 'sin detalles'}`);
      }
      // 2. Emitir CF de reemplazo (codigoGeneracionR requerido por Hacienda cuando tipoAnulacion=1)
      const cf2 = await this.cfService.emitir(this.dtoCf(), empresa.id);
      if (cf2.estado !== EstadoDte.RECIBIDO) {
        throw new Error(`CF de reemplazo rechazado: ${cf2.descripcionMsg ?? cf2.observaciones ?? 'sin detalles'}`);
      }
      // 3. Invalidar CF #1 apuntando a CF #2 como reemplazo
      await this.invalidacionService.anular({
        dteId: cf1.id,
        tipoAnulacion: 1,
        motivoAnulacion: 'Prueba de evento de invalidación iFactu',
        nombreResponsable: 'RESPONSABLE PRUEBA IFACTU',
        tipDocResponsable: '13',
        numDocResponsable: '00000000-0',
        codigoGeneracionR: cf2.codigoGeneracion,
      }, empresa.id);
      return { exitoso: true, detalle: `CF ${cf1.codigoGeneracion} invalidado, reemplazado por ${cf2.codigoGeneracion}`, tiempoMs: Date.now() - inicio };
    } catch (err: any) {
      return { exitoso: false, detalle: err.message ?? 'Error desconocido', tiempoMs: Date.now() - inicio };
    }
  }

  // ── Contingencia ─────────────────────────────────────────────────────────

  async probarContingencia(empresaId: string): Promise<{ exitoso: boolean; detalle: string; tiempoMs: number }> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    const inicio = Date.now();
    try {
      // 1. Emitir CF de prueba normalmente para obtener un DTE firmado válido
      const cf = await this.cfService.emitir(this.dtoCf(), empresa.id);
      if (!cf.id) throw new Error('No se pudo crear el CF de prueba');

      // 2. Marcar como CONTINGENCIA en BD (simula fallo de conexión durante emisión)
      await this.dteRepo.update(cf.id, { estado: EstadoDte.CONTINGENCIA });

      // 3. Procesar la cola de contingencia — esto registra el evento en MH y envía el lote
      const resultado = await this.contingenciaService.procesarCola(
        1,
        'Prueba de evento de contingencia iFactu',
        empresa.id,
      );

      const exitoso = resultado.enviados > 0 && resultado.fallidos === 0;
      const detalle = `Enviados: ${resultado.enviados}, Fallidos: ${resultado.fallidos}, Lotes: ${resultado.codigosLote.join(', ')}`;
      return { exitoso, detalle, tiempoMs: Date.now() - inicio };
    } catch (err: any) {
      return { exitoso: false, detalle: err.message ?? 'Error desconocido', tiempoMs: Date.now() - inicio };
    }
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private async getEmpresaPruebas(empresaId: string): Promise<Empresa> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    if (empresa.mhAmbiente === '01') throw new Error('Esta empresa está en producción. Las pruebas solo están disponibles en ambiente 00.');
    return empresa;
  }
}
