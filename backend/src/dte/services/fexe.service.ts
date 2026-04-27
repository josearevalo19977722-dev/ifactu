import { BillingGuardService } from '../../billing/billing-guard.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { CreateFexeDto } from '../dto/create-fexe.dto';
import { CorrelativesService } from '../../correlatives/correlatives.service';
import { SignerService } from './signer.service';
import { TransmitterService } from './transmitter.service';
import { montoALetras } from '../../utils/numero-letras';
import { svDateTime } from '../../utils/sv-datetime';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { NotificacionDteService } from "./notificacion-dte.service";
import { getAmbiente, getNitEmisor } from './mh-config.helper';

const TIPO_FEXE = '11';

@Injectable()
export class FexeService {
  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
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

  async emitir(dto: CreateFexeDto, empresaId: string): Promise<Dte> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, '11');
    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    const codigoGeneracion = uuidv4().toUpperCase();
    const numeroControl = await this.correlatives.siguiente(
      TIPO_FEXE, 
      empresa, 
      empresa.codEstableMh ?? 'M001', 
      empresa.codPuntoVentaMh ?? 'P001'
    );
    const { fecEmi, horEmi } = svDateTime();

    // const empresa = await this.empresaService.obtenerPerfil();

    const jsonDte = this.construirJson(dto, codigoGeneracion, numeroControl, fecEmi, horEmi, empresa);

    const jsonFirmado = await this.signer.firmar(jsonDte, empresa);
    const firmado     = JSON.stringify(jsonFirmado);

    const totalGravada = dto.items.reduce((s, i) => s + i.ventaGravada, 0);
    const totalDescu   = dto.items.reduce((s, i) => s + i.montoDescu, 0);
    const totalPagar   = Math.round((totalGravada - totalDescu) * 100) / 100;

    const dte = this.dteRepo.create({
      tipoDte: TIPO_FEXE,
      numeroControl,
      codigoGeneracion,
      jsonDte,
      firmado,
      fechaEmision:    fecEmi,
      totalPagar,
      receptorNombre:  dto.receptor.nombre,
      estado:          EstadoDte.PENDIENTE,
      empresa,
    });

    await this.dteRepo.save(dte);

    try {
      const respuesta = await this.transmitter.transmitir(TIPO_FEXE, codigoGeneracion, jsonFirmado, empresa);
      dte.estado        = respuesta.estado === 'RECIBIDO' ? EstadoDte.RECIBIDO : EstadoDte.RECHAZADO;
      dte.selloRecepcion = respuesta.selloRecepcion ?? null;
      dte.observaciones  = respuesta.observaciones?.join(', ') ?? null;
      dte.clasificaMsg = respuesta.clasificaMsg ?? null;
      dte.codigoMsg = respuesta.codigoMsg ?? null;
      dte.descripcionMsg = respuesta.descripcionMsg ?? null;
      dte.fhProcesamiento = respuesta.fhProcesamiento ?? null;
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

  private construirJson(
    dto: CreateFexeDto,
    codigoGeneracion: string,
    numeroControl: string,
    fecEmi: string,
    horEmi: string,
    empresa: any,
  ): object {
    const ambiente = getAmbiente(empresa, this.config);
    const r2 = (num: number) => Math.round(num * 100) / 100;

    let totalGravada = 0;
    let totalDescu = 0;

    const cuerpoDocumentoNum = dto.items.map((item, index) => {
      const cantidad = item.cantidad || 1;
      const precioUnitario = r2(item.precioUni || 0);
      const ventaGravada = r2(precioUnitario * cantidad);
      
      totalGravada += ventaGravada;

      return {
        numItem: index + 1,
        tipoItem: item.tipoItem || 1,
        numeroDocumento: null,
        cantidad: item.cantidad,
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida: item.uniMedida || 59,
        descripcion: item.descripcion,
        precioUni: precioUnitario,
        montoDescu: 0,
        ventaGravada: ventaGravada,
        tributos: null,
        noGravado: 0,
      };
    });

    totalGravada = r2(totalGravada);
    totalDescu = r2(totalDescu);
    const subTotal = r2(totalGravada - totalDescu);
    const totalPagar = r2(subTotal);

    const json = {
      identificacion: {
        version: 1,
        ambiente,
        tipoDte: TIPO_FEXE,
        numeroControl,
        codigoGeneracion,
        tipoModelo: 1,
        tipoOperacion: 1,
        tipoContingencia: null,
        motivoContin: null,
        tipoExportacion: dto.tipoExportacion || 1,
        fecEmi,
        horEmi,
        tipoMoneda: 'USD',
      },
      documentoRelacionado: null,
      emisor: {
        nit:               getNitEmisor(empresa),
        nrc:               empresa.nrc.replace(/-/g, ''),
        nombre:            empresa.nombreLegal,
        codActividad:      empresa.codActividad,
        descActividad:     empresa.descActividad,
        nombreComercial:   empresa.nombreComercial || null,
        tipoEstablecimiento: empresa.tipoEstablecimiento,
        direccion: {
          departamento: empresa.departamento,
          municipio:    empresa.municipio,
          complemento:  empresa.complemento,
        },
        telefono:        empresa.telefono,
        correo:          empresa.correo,
        codEstableMH:    (empresa.codEstableMh || '').toString().padStart(4, '0'),
        codEstable:      (empresa.codEstableMh || '').toString().padStart(4, '0'),
        codPuntoVentaMH: (empresa.codPuntoVentaMh || '').toString().padStart(4, '0'),
        codPuntoVenta:   (empresa.codPuntoVentaMh || '').toString().padStart(4, '0'),
        recintoFiscal:   null,
        regimen:         null,
      },
      receptor: {
        nombre:        dto.receptor.nombre,
        codPais:       dto.receptor.codPais,
        nombrePais:    dto.receptor.nombrePais,
        complemento:   dto.receptor.complemento || null,
        tipoDocumento: dto.receptor.tipoDocumento || null,
        numDocumento:  dto.receptor.numDocumento || null,
        telefono:      dto.receptor.telefono || null,
        correo:        dto.receptor.correo || null,
      },
      otrosDocumentos: null,
      ventaTercero: null,
      cuerpoDocumento: cuerpoDocumentoNum,
      resumen: {
        totalGravada,
        descuGravada:        totalDescu,
        porcentajeDescuento: 0,
        totalDescu,
        montoTotalOperacion: totalPagar,
        totalNoGravado:      0,
        totalPagar,
        totalLetras:         montoALetras(totalPagar),
        condicionOperacion:  dto.condicionOperacion || 1,
        pagos: [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }],
        numPagoElectronico:  null,
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
