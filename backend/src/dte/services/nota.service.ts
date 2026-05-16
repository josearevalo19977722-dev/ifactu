import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { CreateNotaDto } from '../dto/create-nota.dto';
import { CorrelativesService } from '../../correlatives/correlatives.service';
import { SignerService } from './signer.service';
import { TransmitterService } from './transmitter.service';
import { montoALetras } from '../../utils/numero-letras';
import { svDateTime } from '../../utils/sv-datetime';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { NotificacionDteService } from './notificacion-dte.service';
import { BillingGuardService } from '../../billing/billing-guard.service';
import { getAmbiente, getNitEmisor } from './mh-config.helper';

const TIPO_NC = '05';
const TIPO_ND = '06';

@Injectable()
export class NotaService {
  private readonly logger = new Logger(NotaService.name);
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

  async emitirNc(dto: CreateNotaDto, empresaId: string) {
    return this.emitir('05', dto, empresaId);
  }

  async emitirNd(dto: CreateNotaDto, empresaId: string) {
    return this.emitir('06', dto, empresaId);
  }

  private async emitir(tipoDte: string, dto: CreateNotaDto, empresaId: string) {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, tipoDte);
    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    // Obtener el DTE referenciado por codigoGeneracion o id interno
    const dteRef = await this.dteRepo.findOne({
      where: [
        { codigoGeneracion: dto.dteReferenciadoId.toUpperCase(), empresa: { id: empresaId } },
        { id: dto.dteReferenciadoId, empresa: { id: empresaId } },
      ],
    });
    if (!dteRef) {
      throw new NotFoundException(`DTE referenciado ${dto.dteReferenciadoId} no encontrado o no pertenece a su empresa`);
    }
    if (dteRef.tipoDte !== '03') {
      throw new BadRequestException('Solo se pueden emitir notas de crédito/débito sobre CCF (tipo 03)');
    }
    if (dteRef.estado !== EstadoDte.RECIBIDO) {
      throw new BadRequestException('El CCF referenciado debe estar en estado RECIBIDO');
    }

    const codigoGeneracion = uuidv4().toUpperCase();
    const numeroControl = await this.correlatives.siguiente(
      tipoDte, 
      empresa, 
      empresa.codEstableMh ?? 'M001', 
      empresa.codPuntoVentaMh ?? 'P001'
    );
    const { fecEmi, horEmi } = svDateTime();

    // const empresa = await this.empresaService.obtenerPerfil();

    const jsonDte = this.construirJson(dto, dteRef, tipoDte, codigoGeneracion, numeroControl, fecEmi, horEmi, empresa);

    const jsonFirmado = await this.signer.firmar(jsonDte, empresa);
    const firmado = JSON.stringify(jsonFirmado);

    const jsonRef = dteRef.jsonDte as any;
    const totalGravada = dto.items.reduce((s, i) => s + i.ventaGravada, 0);
    const totalExenta  = dto.items.reduce((s, i) => s + i.ventaExenta, 0);
    const totalNoSuj   = dto.items.reduce((s, i) => s + i.ventaNoSuj, 0);
    const totalDescu   = dto.items.reduce((s, i) => s + i.montoDescu, 0);
    const ivaTotal     = Math.round(totalGravada * 0.13 * 100) / 100;
    const totalPagar   = totalGravada + totalExenta + totalNoSuj - totalDescu + ivaTotal;

    const dte = this.dteRepo.create({
      tipoDte,
      numeroControl,
      codigoGeneracion,
      jsonDte,
      firmado,
      ambiente: getAmbiente(empresa, this.config),
      fechaEmision: fecEmi,
      totalPagar: Math.round(totalPagar * 100) / 100,
      receptorNombre: jsonRef?.receptor?.nombre ?? null,
      estado: EstadoDte.PENDIENTE,
      empresa,
    });

    await this.dteRepo.save(dte);

    try {
      const respuesta = await this.transmitter.transmitir(tipoDte, codigoGeneracion, jsonFirmado, empresa);
      if (respuesta.estado !== 'RECIBIDO') {
        this.logger.warn(`NC/ND rechazado [${codigoGeneracion}]: ${JSON.stringify(respuesta)}`);
        this.logger.warn(`JSON enviado: ${JSON.stringify(jsonDte)}`);
      }
      dte.estado = respuesta.estado === 'RECIBIDO' ? EstadoDte.RECIBIDO : EstadoDte.RECHAZADO;
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
      const jsonRef = dteRef.jsonDte as any;
      this.notificacion.programar({
        dte:      saved,
        correo:   jsonRef?.receptor?.correo   ?? null,
        telefono: jsonRef?.receptor?.telefono ?? null,
        nombre:   jsonRef?.receptor?.nombre   ?? 'Cliente',
        empresa,
      });
    }

    return saved;
  }

  private construirJson(
    dto: CreateNotaDto,
    dteRef: Dte,
    tipoDte: string,
    codigoGeneracion: string,
    numeroControl: string,
    fecEmi: string,
    horEmi: string,
    empresa: any,
  ): object {
    const ambiente    = getAmbiente(empresa, this.config);
    const jsonRef     = dteRef.jsonDte as any;

    const r2 = (num: number) => Math.round(num * 100) / 100;

    let totalGravada = 0;
    let totalExenta = 0;
    let totalNoSuj = 0;
    let totalDescu = 0;
    let ivaTotal = 0;

    // NC (05) y ND (06): MH requiere valores positivos en ambos casos.
    // El tipo de documento (05/06) ya indica si es crédito o débito.

    const cuerpoDocumentoNum = dto.items.map((item, index) => {
      const cantidad = item.cantidad || 1;
      const precioUnitario = r2(item.precioUni || 0);
      const ventaGravada = r2(precioUnitario * cantidad);
      const ivaItem = r2(ventaGravada * 0.13);

      totalGravada += ventaGravada;
      ivaTotal += ivaItem;

      return {
        numItem: index + 1,
        tipoItem: item.tipoItem || 1,
        numeroDocumento: dteRef.codigoGeneracion,
        cantidad: item.cantidad,
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida: item.uniMedida || 59,
        descripcion: item.descripcion,
        precioUni: precioUnitario,
        montoDescu: 0,
        ventaNoSuj: 0,
        ventaExenta: 0,
        ventaGravada: ventaGravada,
        tributos: ventaGravada !== 0 ? ['20'] : null,
      };
    });

    totalGravada = r2(totalGravada);
    totalExenta = r2(totalExenta);
    totalNoSuj = r2(totalNoSuj);
    totalDescu = r2(totalDescu);
    ivaTotal = r2(ivaTotal);

    const subTotal = r2(totalGravada + totalExenta + totalNoSuj - totalDescu);
    const totalPagar = r2(subTotal + ivaTotal);

    const json = {
      identificacion: {
        version: 3,
        ambiente,
        tipoDte,
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
      documentoRelacionado: [
        {
          tipoDocumento: '03',
          tipoGeneracion: 2,
          numeroDocumento: dteRef.codigoGeneracion,
          fechaEmision: String(dteRef.fechaEmision).substring(0, 10),
        },
      ],
      emisor: {
        // NC/ND (05/06): el esquema MH no permite codEstable/codPuntoVenta/codEstableMH/codPuntoVentaMH
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
        telefono: empresa.telefono,
        correo:   empresa.correo,
      },
      receptor: {
        nit:             jsonRef?.receptor?.nit?.replace(/-/g, '') || null,
        nrc:             jsonRef?.receptor?.nrc?.replace(/-/g, '') || null,
        nombre:          jsonRef?.receptor?.nombre || 'CONSUMIDOR FINAL',
        codActividad:    jsonRef?.receptor?.codActividad || null,
        descActividad:   jsonRef?.receptor?.descActividad || null,
        nombreComercial: jsonRef?.receptor?.nombreComercial || null,
        direccion:       jsonRef?.receptor?.direccion || null,
        telefono:        jsonRef?.receptor?.telefono || null,
        correo:          jsonRef?.receptor?.correo || null,
      },
      ventaTercero: null,
      cuerpoDocumento: cuerpoDocumentoNum,
      resumen: {
        totalNoSuj,
        totalExenta,
        totalGravada,
        subTotalVentas:      r2(totalGravada + totalExenta + totalNoSuj),
        descuNoSuj:          0,
        descuExenta:         0,
        descuGravada:        totalDescu,
        totalDescu,
        tributos: totalGravada !== 0 ? [{ codigo: '20', descripcion: 'IVA 13%', valor: ivaTotal }] : null,
        subTotal,
        ivaPerci1:            0,
        ivaRete1:             0,
        reteRenta:            0,
        montoTotalOperacion:  r2(totalPagar),
        totalLetras:          montoALetras(Math.abs(totalPagar)),
        condicionOperacion:   1,
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
