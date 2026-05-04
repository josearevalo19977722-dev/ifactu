import { BillingGuardService } from '../../billing/billing-guard.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Dte, EstadoDte } from '../entities/dte.entity';
import { CreateDonacionDto } from '../dto/create-donacion.dto';
import { CorrelativesService } from '../../correlatives/correlatives.service';
import { SignerService } from './signer.service';
import { TransmitterService } from './transmitter.service';
import { montoALetras } from '../../utils/numero-letras';
import { svDateTime } from '../../utils/sv-datetime';
import { EmpresaService } from '../../empresa/services/empresa.service';
import { NotificacionDteService } from "./notificacion-dte.service";
import { getAmbiente, getNitEmisor } from './mh-config.helper';

const TIPO = '15';

@Injectable()
export class DonacionService {
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

  async emitir(dto: CreateDonacionDto, empresaId: string): Promise<Dte> {
    const empresa = await this.empresaService.findById(empresaId);
    if (!empresa) throw new Error('Empresa no encontrada');
    await this.billingGuard.verificarPuedeEmitir(empresaId);
    this.empresaService.assertTipoDteHabilitado(empresa, '15');
    if (!empresa.nit) throw new Error('La empresa no tiene NIT configurado');

    const codigoGeneracion = uuidv4().toUpperCase();
    const numeroControl = await this.correlatives.siguiente(
      TIPO,
      empresa,
      empresa.codEstableMh ?? 'M001',
      empresa.codPuntoVentaMh ?? 'P001',
    );
    const { fecEmi, horEmi } = svDateTime();

    const jsonDte     = this.construirJson(dto, codigoGeneracion, numeroControl, fecEmi, horEmi, empresa);
    const jsonFirmado = await this.signer.firmar(jsonDte, empresa);

    const valorTotal = dto.items.reduce((s, i) => s + i.valor, 0);

    const dte = this.dteRepo.create({
      tipoDte: TIPO, numeroControl, codigoGeneracion, jsonDte,
      firmado: JSON.stringify(jsonFirmado), fechaEmision: fecEmi,
      totalPagar: Math.round(valorTotal * 100) / 100,
      receptorNombre: dto.donatario.nombre, estado: EstadoDte.PENDIENTE,
      empresa,
    });
    await this.dteRepo.save(dte);

    try {
      const r = await this.transmitter.transmitir(TIPO, codigoGeneracion, jsonFirmado, empresa);
      dte.estado = r.estado === 'RECIBIDO' ? EstadoDte.RECIBIDO : EstadoDte.RECHAZADO;
      dte.selloRecepcion = r.selloRecepcion ?? null;
      dte.observaciones  = r.observaciones?.join(', ') ?? null;
      dte.clasificaMsg   = r.clasificaMsg ?? null;
      dte.codigoMsg      = r.codigoMsg ?? null;
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
    try { await this.incrementarContador(empresaId); } catch (e) { console.error('Error contador:', e.message); }

    if (saved.estado === EstadoDte.RECIBIDO) {
      this.notificacion.programar({
        dte:      saved,
        correo:   dto.donatario?.correo   ?? null,
        telefono: dto.donatario?.telefono ?? null,
        nombre:   dto.donatario?.nombre   ?? 'Donatario',
        empresa,
      });
    }

    return saved;
  }

  private construirJson(
    dto: CreateDonacionDto,
    codigoGeneracion: string,
    numeroControl: string,
    fecEmi: string,
    horEmi: string,
    empresa: any,
  ) {
    const ambiente = getAmbiente(empresa, this.config);
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const cuerpoDocumento = dto.items.map((item, index) => ({
      numItem:      index + 1,
      tipoDonacion: item.tipoDonacion || 1,
      cantidad:     item.cantidad,
      codigo:       item.codigo || null,
      // Tipo 15: para dineraria usar 99 (Otra), para especie la unidad real
      uniMedida:    item.tipoDonacion === 1 ? 99 : item.uniMedida,
      descripcion:  item.descripcion,
      valorUni:     r2(item.valorUni),
      // NO montoDescu — no está permitido en tipo 15
      depreciacion: r2(item.depreciacion || 0),
      valor:        r2(item.valor),
    }));

    const valorTotal = r2(dto.items.reduce((s, i) => s + i.valor, 0));

    return {
      identificacion: {
        version:       1,
        ambiente,
        tipoDte:       TIPO,
        numeroControl,
        codigoGeneracion,
        tipoModelo:    1,
        tipoOperacion: 1,
        // Tipo 15: tipoContingencia y motivoContin NO están permitidos
        fecEmi,
        horEmi,
        tipoMoneda:    'USD',
      },
      // Tipo 15: donante usa tipoDocumento + numDocumento (NO campo 'nit')
      donante: {
        tipoDocumento:  '36',
        numDocumento:   getNitEmisor(empresa),
        nrc:            empresa.nrc.replace(/-/g, ''),
        nombre:         empresa.nombreLegal,
        codActividad:   empresa.codActividad,
        descActividad:  empresa.descActividad,
        codDomiciliado: 1,                             // 1=Domiciliado
        codPais:        'SV',
        direccion: {
          departamento: empresa.departamento,
          municipio:    empresa.municipio,
          complemento:  empresa.complemento,
        },
        telefono: empresa.telefono,
        correo:   empresa.correo,
      },
      // Tipo 15: donatario — sin campo 'nit', usa tipoDocumento + numDocumento
      donatario: {
        tipoDocumento:       dto.donatario.tipoDocumento,
        numDocumento:        dto.donatario.numDocumento.replace(/-/g, ''),
        ...(dto.donatario.nrc?.replace(/-/g, '') ? { nrc: dto.donatario.nrc.replace(/-/g, '') } : {}),
        nombre:              dto.donatario.nombre,
        nombreComercial:     dto.donatario.nombreComercial || dto.donatario.nombre,
        ...(dto.donatario.codActividad  ? { codActividad:  dto.donatario.codActividad  } : {}),
        ...(dto.donatario.descActividad ? { descActividad: dto.donatario.descActividad } : {}),
        tipoEstablecimiento: dto.donatario.tipoEstablecimiento,
        direccion: {
          departamento: dto.donatario.direccionDepartamento,
          municipio:    dto.donatario.direccionMunicipio,
          complemento:  dto.donatario.direccionComplemento,
        },
        ...(dto.donatario.telefono?.trim() ? { telefono: dto.donatario.telefono.trim() } : {}),
        ...(dto.donatario.correo?.trim()   ? { correo:   dto.donatario.correo.trim()   } : {}),
        codEstableMH:    (dto.donatario.codEstableMH  || '0001').padStart(4, '0'),
        codEstable:      (dto.donatario.codEstableMH  || '0001').padStart(4, '0'),
        codPuntoVentaMH: dto.donatario.codPuntoVentaMH || 'P001',
        codPuntoVenta:   dto.donatario.codPuntoVentaMH || 'P001',
      },
      cuerpoDocumento,
      resumen: {
        valorTotal,
        totalLetras: montoALetras(valorTotal),
        // Tipo 15: pagos requerido — sin periodo ni plazo
        pagos: [{
          codigo:     '01',
          montoPago:  valorTotal,
          referencia: null,
        }],
      },
      // Tipo 15: otrosDocumentos requiere al menos 1 ítem
      // CAT-021: 1=Emisor, 2=Receptor (del documento asociado)
      otrosDocumentos: [{
        codDocAsociado:   2,   // Receptor — documento asociado al donatario
        descDocumento:    dto.descripcionResolucion || 'Resolución de autorización para recibir donaciones deducibles',
        detalleDocumento: dto.numResolucion || 'N/A',
      }],
      apendice: null,
    };
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
