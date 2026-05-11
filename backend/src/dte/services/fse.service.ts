import { BillingGuardService } from '../../billing/billing-guard.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { CreateFseDto } from '../dto/create-fse.dto';
import { CorrelativesService } from '../../correlatives/correlatives.service';
import { SignerService } from './signer.service';
import { TransmitterService } from './transmitter.service';
import { montoALetras } from '../../utils/numero-letras';
import { svDateTime } from '../../utils/sv-datetime';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { InventarioService } from '../../inventario/inventario.service';
import { NotificacionDteService } from './notificacion-dte.service';
import { getAmbiente, getNitEmisor } from './mh-config.helper';

const TIPO = '14';

@Injectable()
export class FseService {
  constructor(
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    private readonly correlatives: CorrelativesService,
    private readonly signer: SignerService,
    private readonly transmitter: TransmitterService,
    private readonly config: ConfigService,
    private readonly empresaService: EmpresaService,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly inventario: InventarioService,
    private readonly notificacion: NotificacionDteService,
    private readonly billingGuard: BillingGuardService,
  ) {}

  async emitir(dto: CreateFseDto, empresaId: string, sucursal?: string, pos?: string): Promise<Dte> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, '14');

    const codEstable = sucursal || empresa.codEstableMh || '0001';
    const codPuntoVenta = pos || empresa.codPuntoVentaMh || 'P001';

    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    const codigoGeneracion = uuidv4().toUpperCase();
    const numeroControl = await this.correlatives.siguiente(
      TIPO, 
      empresa, 
      codEstable, 
      codPuntoVenta
    );
    const { fecEmi, horEmi } = svDateTime();

    // const empresa = await this.empresaService.obtenerPerfil();

    const jsonDte    = this.construirJson(dto, codigoGeneracion, numeroControl, fecEmi, horEmi, empresa, codEstable, codPuntoVenta);
    const jsonFirmado = await this.signer.firmar(jsonDte, empresa);

    const total = dto.items.reduce((s, i) => s + (i.compraAfectada || 0) + (i.compraExenta || 0) + (i.compraNoSujeta || 0) - i.montoDescu, 0);

    const dte = this.dteRepo.create({
      tipoDte: TIPO, numeroControl, codigoGeneracion, jsonDte,
      firmado: JSON.stringify(jsonFirmado), fechaEmision: fecEmi,
      ambiente: getAmbiente(empresa, this.config),
      totalPagar: Math.round(total * 100) / 100,
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

    // Incrementar stock por ser una COMPRA (Sujeto Excluido)
    // Solo se procesan Bienes (tipoItem === 1) con código
    try {
      const itemsParaInventario = dto.items
        .filter(i => (i.tipoItem || 1) === 1 && i.codigo)
        .map(i => ({
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          costoUnitario: i.precioUni,
        }));

      if (itemsParaInventario.length > 0) {
        this.inventario.procesarItemsCompra(
          itemsParaInventario,
          saved.id,
          fecEmi,
        ).catch(err => console.error('[FSE] Error sumando stock:', err.message));
      }
    } catch (err) {
      console.error('[FSE] Error preparando items para inventario:', err.message);
    }

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
    dto: CreateFseDto,
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

    let totalNoSuj = 0;
    let totalExenta = 0;
    let totalAfect = 0;
    let totalDescu = 0;

    const cuerpoDocumentoNum = dto.items.map((item, index) => {
      const cantidad = item.cantidad || 1;
      const precioUnitario = r2(item.precioUni || 0);
      const montoDescu = r2(item.montoDescu || 0);
      const compra = r2(precioUnitario * cantidad - montoDescu);

      totalDescu += montoDescu;
      totalAfect += compra; // Para FSE usamos totalAfect como acumulador de totalCompra

      return {
        numItem: index + 1,
        tipoItem: item.tipoItem || 1,
        cantidad: item.cantidad,
        codigo: item.codigo || null,
        uniMedida: item.uniMedida || 59,
        descripcion: item.descripcion,
        precioUni: precioUnitario,
        montoDescu: montoDescu,
        compra,
      };
    });

    totalDescu = r2(totalDescu);
    const totalCompra = r2(totalAfect);
    const totalPagar = r2(totalCompra - (dto.reteRenta ?? 0)); // Nota: En FSE v1 subTotal es totalCompra

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
        nit:               getNitEmisor(empresa),
        nrc:               empresa.nrc.replace(/-/g, ''),
        nombre:            empresa.nombreLegal,
        codActividad:      empresa.codActividad,
        descActividad:     empresa.descActividad,
        direccion: {
          departamento: empresa.departamento,
          municipio:    empresa.municipio,
          complemento:  empresa.complemento,
        },
        telefono:        empresa.telefono,
        correo:          empresa.correo,
        codEstable:      (codEstable).toString().padStart(4, '0'),
        codEstableMH:    (codEstable).toString().padStart(4, '0'),
        codPuntoVenta:   (codPuntoVenta).toString(),
        codPuntoVentaMH: (codPuntoVenta).toString(),
      },
      sujetoExcluido: {
        tipoDocumento: dto.receptor.tipoDocumento || '01',
        numDocumento: dto.receptor.numDocumento.replace(/-/g, ''),
        nombre: dto.receptor.nombre,
        codActividad: dto.receptor.codActividad || null,
        descActividad: dto.receptor.descActividad || null,
        direccion: {
          departamento: dto.receptor.direccionDepartamento,
          municipio:    dto.receptor.direccionMunicipio,
          complemento:  dto.receptor.direccionComplemento,
        },
        telefono: dto.receptor.telefono || null,
        correo: dto.receptor.correo || null,
      },
      cuerpoDocumento: cuerpoDocumentoNum,
      resumen: {
        totalCompra,
        descu: totalDescu,
        totalDescu: 0,
        subTotal: totalCompra,
        ivaRete1: 0,
        reteRenta: dto.reteRenta ?? 0,
        totalPagar,
        totalLetras: montoALetras(totalPagar),
        condicionOperacion: dto.condicionOperacion || 1,
        pagos: [{ codigo: '01', montoPago: totalPagar, referencia: null, plazo: null, periodo: null }],
        observaciones: dto.observaciones || null,
      },
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
