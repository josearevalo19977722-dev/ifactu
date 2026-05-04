import { BillingGuardService } from '../../billing/billing-guard.service';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { CreateCfDto } from '../dto/create-cf.dto';
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

const TIPO_CF = '01';

@Injectable()
export class CfService {
  private readonly logger = new Logger(CfService.name);
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

  async emitir(dto: CreateCfDto, empresaId: string, sucursal?: string, pos?: string): Promise<any> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, TIPO_CF);
    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    if (dto.condicionOperacion === 2 && !dto.pagos.some(p => p.plazo)) {
      throw new BadRequestException('Condición "Crédito" requiere especificar el plazo en el pago');
    }

    const rawCe = sucursal ?? empresa.codEstableMh ?? '0001';
    const rawPv = pos ?? empresa.codPuntoVentaMh ?? 'P001';
    const emision = await this.sucursalesService.resolverEmisionCatalogo(empresa, rawCe, rawPv);
    const { codEstable, codPuntoVenta, sucursal: sucursalRef, puntoVenta: puntoVentaRef } = emision;

    const { fecEmi, horEmi } = svDateTime();
    const codigoGeneracion = uuidv4().toUpperCase();

    // 1. Obtener correlativo (mismo criterio que CCF / POS)
    const numeroControl = await this.correlatives.siguiente(
      TIPO_CF,
      empresa,
      codEstable,
      codPuntoVenta,
    );

    // 2. Construir JSON original
    const jsonDte = this.construirJson(
      dto,
      codigoGeneracion,
      numeroControl,
      fecEmi,
      horEmi,
      empresa,
      codEstable,
      codPuntoVenta,
    );

    // 4. Crear registro INICIAL en BD (PENDIENTE)
    // Guardamos antes de firmar para asegurar que el registro exista incluso si la firma falla
    let dte = this.dteRepo.create({
      tipoDte: TIPO_CF,
      numeroControl,
      codigoGeneracion,
      jsonDte,
      fechaEmision: fecEmi,
      totalPagar: this.calcularTotal(dto),
      receptorNombre: (dto.receptor?.nombre || 'CONSUMIDOR FINAL').trim().toUpperCase(),
      estado: EstadoDte.PENDIENTE,
      empresa,
      sucursal: sucursalRef ?? undefined,
      puntoVenta: puntoVentaRef ?? undefined,
    });

    dte = await this.dteRepo.save(dte);

    try {
      // 5. Firma
      const jsonFirmado = await this.signer.firmar(jsonDte, empresa);
      dte.firmado = JSON.stringify(jsonFirmado);

      // 6. Transmisión al MH
      const respuesta = await this.transmitter.transmitir(
        TIPO_CF,
        codigoGeneracion,
        jsonFirmado,
        empresa,
      );

      // 7. Actualizar estado según respuesta del MH
      dte.estado = respuesta.estado === 'RECIBIDO' ? EstadoDte.RECIBIDO : EstadoDte.RECHAZADO;
      dte.selloRecepcion = respuesta.selloRecepcion ?? null;
      dte.observaciones = respuesta.observaciones?.join(' | ') ?? respuesta.descripcionMsg ?? null;

      const saved = await this.dteRepo.save(dte);

      // 8. Acciones post-emisión exitosa
      if (saved.estado === EstadoDte.RECIBIDO) {
        await this.incrementarContador(empresa.id).catch(e => this.logger.error('Error contador:', e.message));
        
        this.inventario.descontarStockDte(
          dto.items.map(i => ({ codigo: i.codigo, cantidad: i.cantidad, descripcion: i.descripcion, tipoItem: i.tipoItem })),
          saved.id,
          fecEmi
        ).catch(err => this.logger.error('Error stock:', err.message));

        this.notificacion.programar({
          dte:      saved,
          correo:   dto.receptor?.correo   ?? null,
          telefono: dto.receptor?.telefono ?? null,
          nombre:   dto.receptor?.nombre   ?? 'Cliente',
          empresa,
        });
      }

      return saved;

    } catch (error) {
      this.logger.error(`FALLO PROCESAMIENTO DTE ${codigoGeneracion}: ${error.message}`);

      // Distinguir entre fallo de red (→ CONTINGENCIA) y rechazo lógico (→ RECHAZADO)
      if (error.message?.includes('CONTINGENCIA')) {
        dte.estado = EstadoDte.CONTINGENCIA;
      } else {
        dte.estado = EstadoDte.RECHAZADO;
        dte.observaciones = error.message;
      }
      return await this.dteRepo.save(dte);
    }
  }

  private cleanObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj
        .map(v => this.cleanObject(v))
        .filter(v => v !== null && v !== undefined);
    }
    const cleaned: any = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleanedValue = this.cleanObject(v);
      if (cleanedValue !== null && cleanedValue !== undefined) {
        cleaned[k] = cleanedValue;
      }
    }
    return cleaned;
  }

  private construirJson(
    dto: CreateCfDto,
    codigoGeneracion: string,
    numeroControl: string,
    fecEmi: string,
    horEmi: string,
    empresa: any,
    codEstable: string,
    codPuntoVenta: string,
  ): object {
    const ambiente = getAmbiente(empresa, this.config);
    // CF: En la Factura de Consumidor Final (01), todos los precios y montos
    // deben reportarse CON EL IVA INCLUIDO en el JSON (Montos Brutos).
    const r2 = (n: number) => Math.round(n * 100) / 100;
    
    let totalGravada = 0;
    let totalExenta = 0;
    let totalNoSuj = 0;
    let totalDescu = 0;
    let ivaTotal = 0;

    const cuerpoDocumento = dto.items.map((item, index) => {
      const cantidad = item.cantidad || 1;
      const precioBruto = r2(item.precioUni || 0);
      const ventaTotalItem = r2(precioBruto * cantidad);
      const ivaItem = r2(ventaTotalItem - (ventaTotalItem / 1.13));
      
      totalGravada += ventaTotalItem;
      ivaTotal += ivaItem;

      return {
        numItem: index + 1,
        tipoItem: item.tipoItem || 1,
        numeroDocumento: null,
        cantidad: item.cantidad,
        codigo: item.codigo || null,
        codTributo: null,
        uniMedida: item.uniMedida || 59,
        descripcion: item.descripcion,
        precioUni: precioBruto, 
        montoDescu: 0,
        ventaNoSuj: 0,
        ventaExenta: 0,
        ventaGravada: ventaTotalItem,
        tributos: null,
        psv: 0,
        noGravado: 0,
        ivaItem,
      };
    });

    totalGravada = r2(totalGravada);
    totalExenta = r2(totalExenta);
    totalNoSuj = r2(totalNoSuj);
    totalDescu = r2(totalDescu);
    ivaTotal = r2(ivaTotal);
    
    const subTotal = r2(totalGravada + totalExenta + totalNoSuj);
    const totalPagar = r2(subTotal - (dto.reteRenta || 0));

    const json = {
      identificacion: {
        version: 1,
        ambiente,
        tipoDte: TIPO_CF,
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
      // Receptor: Manual Hacienda dice que es opcional para Factura (01) si total < $200
      // y no se ha proporcionado info específica del cliente.
      receptor: (totalPagar >= 200 || dto.receptor?.numDocumento) 
        ? {
            tipoDocumento: dto.receptor?.tipoDocumento || null,
            numDocumento: (dto.receptor?.tipoDocumento === '13' && dto.receptor?.numDocumento?.length === 9)
              ? `${dto.receptor.numDocumento.substring(0, 8)}-${dto.receptor.numDocumento.substring(8)}`
              : dto.receptor?.numDocumento?.trim() || null,
            nrc: null,
            nombre: (dto.receptor?.nombre || 'CONSUMIDOR FINAL').trim().toUpperCase(),
            codActividad: null,
            descActividad: null,
            direccion: null,
            telefono: dto.receptor?.telefono?.trim() || null,
            correo: dto.receptor?.correo?.trim() || null,
          }
        : null,
      otrosDocumentos: null,
      ventaTercero: null,
      cuerpoDocumento,
      resumen: {
        totalNoSuj: totalNoSuj,
        totalExenta: totalExenta,
        totalGravada: totalGravada,
        subTotalVentas: subTotal,
        descuNoSuj: 0,
        descuExenta: 0,
        descuGravada: totalDescu,
        porcentajeDescuento: 0,
        totalDescu: totalDescu,
        tributos: null, // En Factura (01) el resumen no lleva detalle de IVA si es consumidor final
        subTotal: subTotal,
        ivaRete1: 0,
        reteRenta: dto.reteRenta || 0,
        totalIva: ivaTotal, // El campo final que faltaba
        montoTotalOperacion: subTotal, 
        totalNoGravado: 0,
        totalPagar: totalPagar,
        totalLetras: montoALetras(totalPagar),
        saldoFavor: 0,
        condicionOperacion: dto.condicionOperacion || 1,
        pagos: (dto.pagos && dto.pagos.length > 0)
          ? dto.pagos.map(p => ({
              codigo:     p.codigo,
              montoPago:  p.montoPago,
              referencia: p.referencia || null,
              plazo:      p.plazo      || null,
              periodo:    p.periodo    || null,
            }))
          : [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }],
        numPagoElectronico: dto.numPagoElectronico || null,
      },
      extension: null,
      apendice: null,
    };

    // No usamos cleanObject para que los 'null' viajen al validador y no den error de "campo requerido"
    return json;
  }

  private calcularTotal(dto: CreateCfDto): number {
    const subTotal = dto.items.reduce(
      (s, i) => s + i.ventaGravada + i.ventaExenta + i.ventaNoSuj - i.montoDescu,
      0,
    );
    return Math.round((subTotal - (dto.reteRenta ?? 0)) * 100) / 100;
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
