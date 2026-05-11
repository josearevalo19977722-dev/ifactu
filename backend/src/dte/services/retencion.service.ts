import { BillingGuardService } from '../../billing/billing-guard.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { CreateRetencionDto } from '../dto/create-retencion.dto';
import { montoALetras } from '../../utils/numero-letras';
import { svDateTime } from '../../utils/sv-datetime';
import { CorrelativesService } from '../../correlatives/correlatives.service';
import { SignerService } from './signer.service';
import { TransmitterService } from './transmitter.service';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { NotificacionDteService } from "./notificacion-dte.service";
import { getAmbiente, getNitEmisor } from './mh-config.helper';

const TIPO = '07';

@Injectable()
export class RetencionService {
  constructor(
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    private readonly correlatives: CorrelativesService,
    private readonly signer: SignerService,
    private readonly transmitter: TransmitterService,
    private readonly config: ConfigService,
    private readonly empresaService: EmpresaService,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly notificacion: NotificacionDteService,
    private readonly billingGuard: BillingGuardService,
  ) {}

  async emitir(dto: CreateRetencionDto, empresaId: string): Promise<Dte> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, '07');
    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    const codigoGeneracion = uuidv4().toUpperCase();
    const numeroControl = await this.correlatives.siguiente(
      TIPO, 
      empresa, 
      empresa.codEstableMh ?? 'M001', 
      empresa.codPuntoVentaMh ?? 'P001'
    );
    const { fecEmi, horEmi } = svDateTime();

    // const empresa = await this.empresaService.obtenerPerfil();

    const jsonDte    = this.construirJson(dto, codigoGeneracion, numeroControl, fecEmi, horEmi, empresa);
    const jsonFirmado = await this.signer.firmar(jsonDte, empresa);

    const totalRetenido = dto.items.reduce((s, i) => s + i.ivaRetenido, 0);

    const dte = this.dteRepo.create({
      tipoDte: TIPO, numeroControl, codigoGeneracion, jsonDte,
      firmado: JSON.stringify(jsonFirmado), fechaEmision: fecEmi,
      ambiente: getAmbiente(empresa, this.config),
      totalPagar: Math.round(totalRetenido * 100) / 100,
      receptorNombre: dto.receptor.nombre, estado: EstadoDte.PENDIENTE,
      empresa,
    });
    await this.dteRepo.save(dte);

    try {
      const r = await this.transmitter.transmitir(TIPO, codigoGeneracion, jsonFirmado, empresa);
      dte.estado = r.estado === 'RECIBIDO' ? EstadoDte.RECIBIDO : EstadoDte.RECHAZADO;
      dte.selloRecepcion = r.selloRecepcion ?? null;
      dte.observaciones  = r.observaciones?.join(', ') ?? null;
      dte.clasificaMsg = r.clasificaMsg ?? null;
      dte.codigoMsg = r.codigoMsg ?? null;
      dte.descripcionMsg = r.descripcionMsg ?? null;
      dte.fhProcesamiento = r.fhProcesamiento ?? null;
    } catch (err) {
      if (err.message?.includes('CONTINGENCIA')) {
        dte.estado = EstadoDte.CONTINGENCIA;
      } else {
        dte.estado = EstadoDte.RECHAZADO;
        dte.observaciones = err.message;
      }
    }

    const saved = await this.dteRepo.save(dte);
    try { await this.incrementarContador(empresaId); } catch (e) { console.error("Error contador:", e.message); }

    if (saved.estado === EstadoDte.RECIBIDO) {
      this.notificacion.programar({
        dte:      saved,
        correo:   dto.receptor?.correo   ?? null,
        telefono: dto.receptor?.telefono ?? null,
        nombre:   dto.receptor?.nombre   ?? 'Cliente',
        empresa,
      });
    }

    return saved;
  }

  private construirJson(dto: CreateRetencionDto, codigoGeneracion: string, numeroControl: string, fecEmi: string, horEmi: string, empresa: any) {
    const ambiente = getAmbiente(empresa, this.config);
    const r2 = (num: number) => Math.round(num * 100) / 100;

    let totalSujetoRetencion = 0;
    let totalIvaRetenido = 0;

    const cuerpoDocumentoNum = dto.items.map((i, index) => {
      const montoSujetoGrav  = r2(i.montoSujetoGrav || 0);
      const ivaRetenido      = r2(i.ivaRetenido || 0);
      // tipoDoc: tipo de documento relacionado — 2=Electrónico (DTE), 1=Físico
      // NO es "tipo de retención" (IVA/Renta); eso va en codigoRetencionMH
      // tipoDoc: 1=Físico (sin validación cruzada Hacienda), 2=Electrónico (valida codigoGeneracion)
      const tipoDoc = (i.tipoDoc === 1) ? 1 : 2;
      // codigoRetencionMH: Catálogo 22 — C9=IVA 13%, C4=IVA 1%, C00-C12=Renta
      const codRet  = (i.codigoRetencionMH || '').trim() || 'C9';

      totalSujetoRetencion += montoSujetoGrav;
      totalIvaRetenido     += ivaRetenido;

      return {
        numItem:      index + 1,
        tipoDte:      i.tipoDteRelacionado || '03',
        tipoDoc,
        // numDocumento es requerido por Hacienda — si el usuario no lo llenó usamos el UUID de esta retención
        numDocumento: (i.numDocumento || '').trim() || codigoGeneracion,
        fechaEmision: (i.fechaDocumento || '').trim() || fecEmi,
        descripcion:  i.descripcion,
        montoSujetoGrav,
        codigoRetencionMH: codRet,
        ivaRetenido,
      };
    });

    totalSujetoRetencion = r2(totalSujetoRetencion);
    totalIvaRetenido     = r2(totalIvaRetenido);

    const codEstable    = (empresa.codEstableMh || '').toString().padStart(4, '0');
    const codPuntoVenta = (empresa.codPuntoVentaMh || '').toString().padStart(4, '0');

    const json = {
      identificacion: {
        version: 1,
        ambiente,
        tipoDte: TIPO,
        numeroControl,
        codigoGeneracion,
        tipoModelo: 1,
        tipoOperacion: 1,
        tipoContingencia: null,
        motivoContin: null,
        fecEmi,
        horEmi,
        tipoMoneda: 'USD',
      },
      emisor: {
        // Retención (07): usa codigoMH/codigo/puntoVentaMH/puntoVenta — NO codEstableMH/etc.
        nit:                 getNitEmisor(empresa),
        nrc:                 empresa.nrc.replace(/-/g, ''),
        nombre:              empresa.nombreLegal,
        codActividad:        empresa.codActividad,
        descActividad:       empresa.descActividad,
        nombreComercial:     empresa.nombreComercial || null,
        tipoEstablecimiento: empresa.tipoEstablecimiento,
        direccion: {
          departamento: empresa.departamento,
          municipio:    empresa.municipio,
          complemento:  empresa.complemento,
        },
        telefono:      empresa.telefono,
        correo:        empresa.correo,
        codigoMH:      codEstable,
        codigo:        codEstable,
        puntoVentaMH:  codPuntoVenta,
        puntoVenta:    codPuntoVenta,
      },
      receptor: {
        // Retención (07): usa tipoDocumento/numDocumento — NO nit directo
        tipoDocumento:   '36',  // 36=NIT
        numDocumento:    dto.receptor.nit?.replace(/[-\s]/g, '') || '',
        nrc:             dto.receptor.nrc?.replace(/-/g, '') || null,
        nombre:          dto.receptor.nombre,
        nombreComercial: dto.receptor.nombre,
        codActividad:    dto.receptor.codActividad || null,
        descActividad:   dto.receptor.descActividad || null,
        direccion: {
          departamento: dto.receptor.direccionDepartamento,
          municipio:    dto.receptor.direccionMunicipio,
          complemento:  dto.receptor.direccionComplemento,
        },
        telefono: dto.receptor.telefono || null,
        correo:   dto.receptor.correo   || null,
      },
      cuerpoDocumento: cuerpoDocumentoNum,
      resumen: {
        // Retención (07): solo totalSujetoRetencion + totalIVAretenido + letras
        totalSujetoRetencion,
        totalIVAretenido:       totalIvaRetenido,
        totalIVAretenidoLetras: montoALetras(totalIvaRetenido),
      },
      extension: null,
      apendice: null,
    };

    return json;
  }

  private async incrementarContador(empresaId: string): Promise<void> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) return;
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();
    if (empresa.ultimoResetContador) {
      const ultimoReset = new Date(empresa.ultimoResetContador);
      if (ultimoReset.getMonth() !== mesActual || ultimoReset.getFullYear() !== anioActual) {
        empresa.dtesEmitidosMes = 0;
        empresa.ultimoResetContador = ahora;
      }
    } else {
      empresa.dtesEmitidosMes = 0;
      empresa.ultimoResetContador = ahora;
    }
    empresa.dtesEmitidosMes += 1;
    await this.empresaRepo.save(empresa);
  }
}
