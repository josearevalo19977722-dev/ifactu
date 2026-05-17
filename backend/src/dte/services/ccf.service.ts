import { BillingGuardService } from '../../billing/billing-guard.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { CreateCcfDto } from '../dto/create-ccf.dto';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { montoALetras } from '../../utils/numero-letras';
import { CorrelativesService } from '../../correlatives/correlatives.service';
import { SignerService } from './signer.service';
import { TransmitterService } from './transmitter.service';
import { NotificacionDteService } from './notificacion-dte.service';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { SucursalesService } from '../../empresa/services/sucursales.service';
import { InventarioService } from '../../inventario/inventario.service';
import { svDateTime } from '../../utils/sv-datetime';
import { getAmbiente, getNitEmisor } from './mh-config.helper';

const TIPO_CCF = '03';

@Injectable()
export class CcfService {
  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly correlatives: CorrelativesService,
    private readonly signer: SignerService,
    private readonly transmitter: TransmitterService,
    private readonly config: ConfigService,
    private readonly notificacion: NotificacionDteService,
    private readonly empresaService: EmpresaService,
    private readonly sucursalesService: SucursalesService,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly inventario: InventarioService,
    private readonly billingGuard: BillingGuardService,
  ) {}

  async emitir(dto: CreateCcfDto, empresaId: string, sucursal?: string, pos?: string): Promise<Dte> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, '03');

    const rawCe = sucursal ?? empresa.codEstableMh ?? '0001';
    const rawPv = pos ?? empresa.codPuntoVentaMh ?? 'P001';
    const emision = await this.sucursalesService.resolverEmisionCatalogo(empresa, rawCe, rawPv);
    const { codEstable, codPuntoVenta, sucursal: sucursalRef, puntoVenta: puntoVentaRef } = emision;

    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    // Condición crédito requiere plazo en al menos un pago
    if (dto.condicionOperacion === 2 && !dto.pagos.some(p => p.plazo)) {
      throw new BadRequestException('Condición "Crédito" requiere especificar el plazo en el pago');
    }

    const codigoGeneracion = uuidv4().toUpperCase();
    const numeroControl = await this.correlatives.siguiente(
      TIPO_CCF, 
      empresa, 
      codEstable, 
      codPuntoVenta
    );
    const { fecEmi, horEmi } = svDateTime();

    // const empresa = await this.empresaService.obtenerPerfil();

    const jsonDte = this.construirJson(
      dto,
      codigoGeneracion,
      numeroControl,
      fecEmi,
      horEmi,
      empresa,
      codEstable,
      codPuntoVenta
    );

    const jsonFirmado = await this.signer.firmar(jsonDte, empresa);
    const firmado = JSON.stringify(jsonFirmado);

    const dte = this.dteRepo.create({
      tipoDte: TIPO_CCF,
      numeroControl,
      codigoGeneracion,
      jsonDte,
      firmado,
      ambiente: getAmbiente(empresa, this.config),
      fechaEmision: fecEmi,
      totalPagar: await this.calcularTotal(dto, empresa),
      receptorNombre: dto.receptor.nombre,
      estado: EstadoDte.PENDIENTE,
      empresa: empresa,
      sucursal: sucursalRef ?? undefined,
      puntoVenta: puntoVentaRef ?? undefined,
    });

    await this.dteRepo.save(dte);

    try {
      const respuesta = await this.transmitter.transmitir(
        TIPO_CCF,
        codigoGeneracion,
        jsonFirmado,
        empresa,
      );
      dte.estado =
        respuesta.estado === 'RECIBIDO' ? EstadoDte.RECIBIDO : EstadoDte.RECHAZADO;
      dte.selloRecepcion = respuesta.selloRecepcion ?? null;
      dte.observaciones = respuesta.observaciones?.join(', ') ?? null;
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

    // Descontar stock de inventario por cada ítem con código de producto
    this.inventario.descontarStockDte(
      dto.items.map(i => ({ codigo: i.codigo, cantidad: i.cantidad, descripcion: i.descripcion, tipoItem: i.tipoItem })),
      saved.id,
      fecEmi,
    ).catch(err => console.error('[CCF] Error descontando stock:', err.message));

    if (saved.estado === EstadoDte.RECIBIDO) {
      this.notificacion.programar({
        dte:      saved,
        correo:   dto.receptor?.correo   ?? null,
        telefono: dto.receptor?.telefono ?? null,
        nombre:   dto.receptor?.nombre   ?? 'Cliente',
        empresa,
      });
    }

    try {
      try { await this.incrementarContador(empresaId); } catch (e) { console.error("Error contador:", e.message); }
    } catch (err) {
      console.error('Error incrementando contador:', err.message);
    }

    return saved;
  }

  private construirJson(
    dto: CreateCcfDto,
    codigoGeneracion: string,
    numeroControl: string,
    fecEmi: string,
    horEmi: string,
    empresa: any,
    codEstable: string,
    codPuntoVenta: string,
  ): object {
    const ambiente = getAmbiente(empresa, this.config);
    const r2 = (num: number) => Math.round(num * 100) / 100;
    
    let totalGravada = 0;
    let totalExenta = 0;
    let totalNoSuj = 0;
    let totalDescu = 0;
    let ivaTotal = 0;

    const cuerpoDocumento = dto.items.map((item, index) => {
      const cantidad     = item.cantidad || 1;
      const precioOrig   = item.precioUni || 0;
      const descuento    = item.montoDescu || 0;

      // Precio neto sin IVA (sin redondear aún para mantener precisión)
      const precioNeto   = item.incluyeIva ? precioOrig / 1.13 : precioOrig;

      // ventaGravada redondeada a 2 decimales (lo que va en el JSON DTE)
      const ventaGravada = r2(precioNeto * cantidad - descuento);

      // IVA residual cuando precio incluye IVA → preserva el total exacto del cliente
      // Ej: $5 IVA-inc → base 4.42 + IVA residual 0.58 = $5.00 exacto
      const ivaItem = item.incluyeIva
        ? r2(precioOrig * cantidad - descuento - ventaGravada)
        : r2(ventaGravada * 0.13);

      // precioUni en el JSON: neto con 6 decimales (requerido por MH)
      const precioUniJson = Math.round(precioNeto * 1000000) / 1000000;

      totalGravada += ventaGravada;
      ivaTotal     += ivaItem;

      return {
        numItem: index + 1,
        tipoItem: item.tipoItem || 1,
        numeroDocumento: null,
        cantidad: item.cantidad,
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida: item.uniMedida || 59,
        descripcion: item.descripcion,
        precioUni: precioUniJson,
        montoDescu: descuento,
        ventaNoSuj: 0,
        ventaExenta: 0,
        ventaGravada: ventaGravada,
        tributos: ['20'],
        psv: 0,
        noGravado: 0,
      };
    });

    totalGravada = r2(totalGravada);
    totalExenta = r2(totalExenta);
    totalNoSuj = r2(totalNoSuj);
    totalDescu = r2(totalDescu);
    ivaTotal = r2(ivaTotal);

    // Retención 1% IVA: Solo si receptor es Grande, monto > 100 y emisor NO es agente
    let ivaRete1 = 0;
    if (totalGravada >= 100 && dto.receptor.esGranContribuyente && !empresa.esAgenteRetencion) {
      ivaRete1 = r2(totalGravada * 0.01);
    }

    const subTotal = r2(totalGravada + totalExenta + totalNoSuj - totalDescu);
    const totalPagar = r2(subTotal + ivaTotal - ivaRete1 - (dto.reteRenta ?? 0));

    const json = {
      identificacion: {
        version: 3,
        ambiente,
        tipoDte: TIPO_CCF,
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
      documentoRelacionado: null,
      emisor: {
        nit: getNitEmisor(empresa),
        nrc: empresa.nrc.replace(/-/g, ''),
        nombre: empresa.nombreLegal,
        codActividad: empresa.codActividad,
        descActividad: empresa.descActividad,
        nombreComercial: empresa.nombreComercial || null,
        tipoEstablecimiento: empresa.tipoEstablecimiento,
        direccion: {
          departamento: empresa.departamento,
          municipio: empresa.municipio,
          complemento: empresa.complemento,
        },
        telefono: empresa.telefono,
        correo: empresa.correo,
        codEstableMH:    (codEstable).toString().padStart(4, '0'),
        codEstable:      (codEstable).toString().padStart(4, '0'),
        codPuntoVentaMH: (codPuntoVenta).toString(),
        codPuntoVenta:   (codPuntoVenta).toString(),
      },
      receptor: {
        nit: dto.receptor.nit.replace(/-/g, ''),
        nrc: dto.receptor.nrc.replace(/-/g, ''),
        nombre: dto.receptor.nombre,
        codActividad: dto.receptor.codActividad,
        descActividad: dto.receptor.descActividad,
        nombreComercial: dto.receptor.nombreComercial || null,
        direccion: {
          departamento: dto.receptor.direccionDepartamento,
          municipio: dto.receptor.direccionMunicipio,
          complemento: dto.receptor.direccionComplemento,
        },
        telefono: dto.receptor.telefono || null,
        correo: dto.receptor.correo || null,
      },
      otrosDocumentos: null,
      ventaTercero: null,
      cuerpoDocumento,
      resumen: {
        totalNoSuj,
        totalExenta,
        totalGravada,
        subTotalVentas: r2(totalGravada + totalExenta + totalNoSuj),
        descuNoSuj: 0,
        descuExenta: 0,
        descuGravada: totalDescu,
        porcentajeDescuento: 0,
        totalDescu,
        tributos: [
          {
            codigo: '20',
            descripcion: 'Impuesto al Valor Agregado 13%',
            valor: ivaTotal,
          },
        ],
        subTotal,
        ivaPerci1: 0,
        ivaRete1,
        reteRenta: dto.reteRenta ?? 0,
        montoTotalOperacion: r2(subTotal + ivaTotal),
        totalNoGravado: 0,
        totalPagar,
        totalLetras: montoALetras(totalPagar),
        saldoFavor: 0,
        condicionOperacion: dto.condicionOperacion || 1,
        pagos: dto.pagos.map((p) => ({
          codigo: p.codigo,
          montoPago: p.montoPago,
          referencia: p.referencia || null,
          plazo: p.plazo || null,
          periodo: p.periodo || null,
        })),
        numPagoElectronico: dto.numPagoElectronico || null,
      },
      extension: null,
      apendice: null,
    };

    return json;
  }

  private async calcularTotal(dto: CreateCcfDto, empresa: Empresa): Promise<number> {
    const totalGravada = dto.items.reduce((s, i) => s + i.ventaGravada, 0);
    const totalExenta = dto.items.reduce((s, i) => s + i.ventaExenta, 0);
    const totalNoSuj = dto.items.reduce((s, i) => s + i.ventaNoSuj, 0);
    const totalDescu = dto.items.reduce((s, i) => s + i.montoDescu, 0);
    const ivaTotal = Math.round(totalGravada * 0.13 * 100) / 100;

    let ivaRete1 = 0;
    if (totalGravada >= 100 && dto.receptor.esGranContribuyente && !empresa.esAgenteRetencion) {
      ivaRete1 = Math.round(totalGravada * 0.01 * 100) / 100;
    }

    const total = totalGravada + totalExenta + totalNoSuj - totalDescu + ivaTotal - ivaRete1 - (dto.reteRenta ?? 0);
    return Math.round(total * 100) / 100;
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
