import { BillingGuardService } from '../../billing/billing-guard.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { CreateNreDto } from '../dto/create-nre.dto';
import { CorrelativesService } from '../../correlatives/correlatives.service';
import { SignerService } from './signer.service';
import { TransmitterService } from './transmitter.service';
import { montoALetras } from '../../utils/numero-letras';
import { svDateTime } from '../../utils/sv-datetime';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { NotificacionDteService } from "./notificacion-dte.service";
import { getAmbiente, getNitEmisor } from './mh-config.helper';

const TIPO_NRE = '04';

@Injectable()
export class NreService {
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

  async emitir(dto: CreateNreDto, empresaId: string): Promise<Dte> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, '04');
    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    const codigoGeneracion = uuidv4().toUpperCase();
    const numeroControl = await this.correlatives.siguiente(
      TIPO_NRE, 
      empresa, 
      empresa.codEstableMh ?? 'M001', 
      empresa.codPuntoVentaMh ?? 'P001'
    );
    const { fecEmi, horEmi } = svDateTime();

    // Resolver DTE referenciado si se proporcionó
    let dteRef: Dte | null = null;
    if (dto.dteReferenciadoId) {
      dteRef = await this.dteRepo.findOne({ where: { id: dto.dteReferenciadoId, empresa: { id: empresaId } } });
      if (!dteRef) throw new BadRequestException(`DTE referenciado ${dto.dteReferenciadoId} no encontrado`);
      if (dteRef.tipoDte !== '03') throw new BadRequestException('NRE solo puede referenciar un CCF (tipo 03)');
    }

    const jsonDte    = this.construirJson(dto, dteRef, codigoGeneracion, numeroControl, fecEmi, horEmi, empresa);
    const jsonFirmado = await this.signer.firmar(jsonDte, empresa);
    const firmado     = JSON.stringify(jsonFirmado);

    const totalGravada = dto.items.reduce((s, i) => s + i.ventaGravada, 0);
    const totalExenta  = dto.items.reduce((s, i) => s + i.ventaExenta, 0);
    const totalNoSuj   = dto.items.reduce((s, i) => s + i.ventaNoSuj, 0);
    const totalDescu   = dto.items.reduce((s, i) => s + i.montoDescu, 0);
    const ivaTotal     = Math.round(totalGravada * 0.13 * 100) / 100;
    const totalPagar   = Math.round((totalGravada + totalExenta + totalNoSuj - totalDescu + ivaTotal) * 100) / 100;

    const dte = this.dteRepo.create({
      tipoDte:        TIPO_NRE,
      numeroControl,
      codigoGeneracion,
      jsonDte,
      firmado,
      fechaEmision:   fecEmi,
      totalPagar,
      receptorNombre: dto.receptor.nombre,
      estado:         EstadoDte.PENDIENTE,
      empresa,
    });

    await this.dteRepo.save(dte);

    try {
      const respuesta = await this.transmitter.transmitir(TIPO_NRE, codigoGeneracion, jsonFirmado, empresa);
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
    dto: CreateNreDto,
    dteRef: Dte | null,
    codigoGeneracion: string,
    numeroControl: string,
    fecEmi: string,
    horEmi: string,
    empresa: any,
  ): object {
    const ambiente = getAmbiente(empresa, this.config);

    const r2 = (num: number) => Math.round(num * 100) / 100;

    let totalGravada = 0;
    let totalExenta = 0;
    let totalNoSuj = 0;
    let totalDescu = 0;
    let ivaTotal = 0;

    const cuerpoDocumentoNum = dto.items.map((item, index) => {
      const cantidad = item.cantidad || 1;
      const precioUnitario = r2(item.precioUni || 0);
      const ventaGravada = r2(precioUnitario * cantidad);
      const ivaItem = r2(ventaGravada * 0.13);

      totalGravada += ventaGravada;
      ivaTotal += ivaItem;

      return {
        numItem:         index + 1,
        tipoItem:        item.tipoItem || 1,
        // NRE requiere numeroDocumento siempre — usar el CCF referenciado o el código propio
        numeroDocumento: dteRef ? dteRef.codigoGeneracion : codigoGeneracion,
        cantidad:     item.cantidad,
        codigo:       item.codigo || null,
        codTributo:   null,
        uniMedida:    item.uniMedida || 59,
        descripcion:  item.descripcion,
        precioUni:    precioUnitario,
        montoDescu:   0,
        ventaNoSuj:   0,
        ventaExenta:  0,
        ventaGravada: ventaGravada,
        tributos:     ventaGravada > 0 ? ['20'] : null,
        // NRE (04) NO lleva: psv, noGravado, ivaItem
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
        tipoDte: TIPO_NRE,
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
      documentoRelacionado: dteRef ? [{
        tipoDocumento: '03',
        tipoGeneracion: 2,
        numeroDocumento: dteRef.codigoGeneracion,
        fechaEmision: dteRef.fechaEmision,
      }] : null,
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
      },
      receptor: {
        // NRE (04): usa tipoDocumento+numDocumento en vez de nit directo
        tipoDocumento:   '36',  // 36=NIT; ajustar si el receptor usa DUI(13) u otro doc
        numDocumento:    dto.receptor.nit?.replace(/[-\s]/g, '') || '',
        nrc:             dto.receptor.nrc?.replace(/-/g, '') || null,
        nombre:          dto.receptor.nombre,
        codActividad:    dto.receptor.codActividad || null,
        descActividad:   dto.receptor.descActividad || null,
        nombreComercial: dto.receptor.nombre,  // requerido en NRE
        bienTitulo:      'BT',                 // BT=Bien Título (traslado con propiedad)
        direccion: {
          departamento: dto.receptor.direccionDepartamento,
          municipio:    dto.receptor.direccionMunicipio,
          complemento:  dto.receptor.direccionComplemento,
        },
        telefono: dto.receptor.telefono || null,
        correo:   dto.receptor.correo   || null,
      },
      ventaTercero: null,
      cuerpoDocumento: cuerpoDocumentoNum,
      resumen: {
        // NRE (04): resumen simplificado — sin ivaPerci1, ivaRete1, reteRenta, totalIva,
        // pagos, numPagoElectronico, totalNoGravado, saldoFavor, totalPagar, condicionOperacion
        totalNoSuj,
        totalExenta,
        totalGravada,
        subTotalVentas:      r2(totalGravada + totalExenta + totalNoSuj),
        descuNoSuj:          0,
        descuExenta:         0,
        descuGravada:        totalDescu,
        porcentajeDescuento: 0,
        totalDescu,
        tributos: totalGravada > 0 ? [{
          codigo:      '20',
          descripcion: 'IVA 13%',
          valor:       ivaTotal,
        }] : null,
        subTotal,
        montoTotalOperacion: totalPagar,
        totalLetras:         montoALetras(totalPagar),
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
