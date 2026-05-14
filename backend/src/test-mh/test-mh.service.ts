import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Empresa } from '../empresa/entities/empresa.entity';
import { AuthMhService } from '../auth-mh/auth-mh.service';
import { SignerService } from '../dte/services/signer.service';
import { TransmitterService } from '../dte/services/transmitter.service';
import { montoALetras } from '../utils/numero-letras';
import { getAmbiente, getNitEmisor } from '../dte/services/mh-config.helper';
import { ConfigService } from '@nestjs/config';

export interface TestConexionResult {
  exitoso: boolean;
  mensaje: string;
  tiempoMs: number;
  ambiente: string;
  tokenObtenido?: boolean;
}

export interface TestDteResult {
  exitoso: boolean;
  tipoDte: string;
  codigoGeneracion: string;
  estado?: string;
  selloRecepcion?: string;
  observaciones?: string[];
  descripcionMsg?: string;
  error?: string;
  tiempoMs: number;
}

export interface LoteJob {
  jobId: string;
  empresaId: string;
  tipoDte: string;
  total: number;
  completados: number;
  exitosos: number;
  fallidos: number;
  resultados: TestDteResult[];
  terminado: boolean;
  error?: string;
  iniciadoEn: Date;
}

// Contador para generar correlativos de prueba únicos sin tocar la BD.
// El segmento de 8 chars debe ser codEstableMH(4) + codPuntoVentaMH(4) del emisor.
// Usamos '00010001' que coincide con los valores fijos del emisor de prueba.
let _testCounter = 0;
function nextTestControl(tipoDte: string): string {
  _testCounter = (_testCounter + 1) % 999999999999999;
  const seq = String(_testCounter).padStart(15, '0');
  return `DTE-${tipoDte}-00010001-${seq}`;
}

@Injectable()
export class TestMhService {
  private readonly logger = new Logger(TestMhService.name);
  private readonly jobs = new Map<string, LoteJob>();

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly authMh: AuthMhService,
    private readonly signer: SignerService,
    private readonly transmitter: TransmitterService,
    private readonly config: ConfigService,
  ) {}

  // ── Conexión ─────────────────────────────────────────────────────────────

  async probarConexion(empresaId: string): Promise<TestConexionResult> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    const ambiente = getAmbiente(empresa, this.config);
    const inicio = Date.now();

    try {
      this.authMh.invalidarToken(empresaId);
      const token = await this.authMh.getToken(empresa);
      const tiempoMs = Date.now() - inicio;
      return {
        exitoso: true,
        mensaje: `Conexión exitosa con el Ministerio de Hacienda (${ambiente === '00' ? 'pruebas' : 'producción'})`,
        tiempoMs,
        ambiente,
        tokenObtenido: !!token,
      };
    } catch (err: any) {
      return {
        exitoso: false,
        mensaje: err.message ?? 'Error desconocido',
        tiempoMs: Date.now() - inicio,
        ambiente,
      };
    }
  }

  // ── DTE individual ────────────────────────────────────────────────────────

  async probarDte(empresaId: string, tipoDte: string): Promise<TestDteResult> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    return this.emitirDtePrueba(empresa, tipoDte);
  }

  // ── Lote ─────────────────────────────────────────────────────────────────

  async iniciarLote(empresaId: string, tipoDte: string, cantidad: number): Promise<string> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    const jobId = uuidv4();
    const job: LoteJob = {
      jobId,
      empresaId,
      tipoDte,
      total: cantidad,
      completados: 0,
      exitosos: 0,
      fallidos: 0,
      resultados: [],
      terminado: false,
      iniciadoEn: new Date(),
    };
    this.jobs.set(jobId, job);

    // Proceso async sin bloquear
    this.procesarLote(empresa, tipoDte, cantidad, job).catch(err => {
      job.terminado = true;
      job.error = err.message;
    });

    return jobId;
  }

  consultarLote(jobId: string): LoteJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  private async procesarLote(
    empresa: Empresa,
    tipoDte: string,
    cantidad: number,
    job: LoteJob,
  ): Promise<void> {
    for (let i = 0; i < cantidad; i++) {
      const resultado = await this.emitirDtePrueba(empresa, tipoDte);
      job.resultados.push(resultado);
      job.completados++;
      if (resultado.exitoso) job.exitosos++;
      else job.fallidos++;
    }
    job.terminado = true;
    this.logger.log(`Lote ${job.jobId} terminado: ${job.exitosos}/${job.total} exitosos`);
  }

  // ── Core: emitir un DTE de prueba ─────────────────────────────────────────

  private async emitirDtePrueba(empresa: Empresa, tipoDte: string): Promise<TestDteResult> {
    const inicio = Date.now();
    const codigoGeneracion = uuidv4().toUpperCase();

    try {
      const json = this.buildTestDte(empresa, tipoDte, codigoGeneracion);
      const firmado = await this.signer.firmar(json, empresa);
      const resultado = await this.transmitter.transmitir(tipoDte, codigoGeneracion, firmado, empresa);

      return {
        exitoso: resultado.estado === 'RECIBIDO',
        tipoDte,
        codigoGeneracion,
        estado: resultado.estado,
        selloRecepcion: resultado.selloRecepcion,
        observaciones: resultado.observaciones,
        descripcionMsg: resultado.descripcionMsg,
        tiempoMs: Date.now() - inicio,
      };
    } catch (err: any) {
      return {
        exitoso: false,
        tipoDte,
        codigoGeneracion,
        error: err.message ?? 'Error desconocido',
        tiempoMs: Date.now() - inicio,
      };
    }
  }

  // ── Constructor de JSON de prueba por tipo ────────────────────────────────

  private buildTestDte(empresa: Empresa, tipoDte: string, codigoGeneracion: string): object {
    const hoy = new Date();
    const fecEmi = hoy.toISOString().split('T')[0];
    const horEmi = hoy.toTimeString().split(' ')[0];
    const ambiente = getAmbiente(empresa, this.config);
    const nit = getNitEmisor(empresa);
    const numeroControl = nextTestControl(tipoDte);

    const emisor = {
      nit,
      nrc: empresa.nrc?.replace(/-/g, '') ?? '0',
      nombre: empresa.nombreLegal,
      codActividad: empresa.codActividad ?? '00000',
      descActividad: empresa.descActividad ?? 'Actividad de prueba',
      nombreComercial: empresa.nombreComercial ?? null,
      tipoEstablecimiento: empresa.tipoEstablecimiento ?? '01',
      direccion: {
        departamento: empresa.departamento ?? '06',
        municipio: empresa.municipio ?? '14',
        complemento: empresa.complemento ?? 'Dirección de prueba',
      },
      telefono: empresa.telefono ?? '00000000',
      correo: empresa.correo ?? 'prueba@test.com',
      codEstableMH: '0001',
      codEstable: '0001',
      codPuntoVentaMH: '0001',
      codPuntoVenta: '0001',
    };

    switch (tipoDte) {
      case '01': return this.buildCf(ambiente, tipoDte, numeroControl, codigoGeneracion, fecEmi, horEmi, emisor);
      case '03': return this.buildCcf(ambiente, tipoDte, numeroControl, codigoGeneracion, fecEmi, horEmi, emisor, nit);
      case '14': return this.buildFse(ambiente, tipoDte, numeroControl, codigoGeneracion, fecEmi, horEmi, emisor);
      case '11': return this.buildFexe(ambiente, tipoDte, numeroControl, codigoGeneracion, fecEmi, horEmi, emisor, nit);
      case '07': return this.buildRetencion(ambiente, tipoDte, numeroControl, codigoGeneracion, fecEmi, horEmi, emisor, nit);
      case '15': return this.buildDonacion(ambiente, tipoDte, numeroControl, codigoGeneracion, fecEmi, horEmi, emisor);
      default:   return this.buildCf(ambiente, '01', nextTestControl('01'), codigoGeneracion, fecEmi, horEmi, emisor);
    }
  }

  // CF — Factura Consumidor Final (01)
  private buildCf(amb: string, tipoDte: string, numCtrl: string, codGen: string, fec: string, hor: string, emisor: any) {
    const gravada = 1.13;
    const iva = 0.13;
    return {
      identificacion: { version: 1, ambiente: amb, tipoDte, numeroControl: numCtrl, codigoGeneracion: codGen, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: fec, horEmi: hor, tipoMoneda: 'USD' },
      documentoRelacionado: null,
      emisor,
      receptor: null,
      otrosDocumentos: null,
      ventaTercero: null,
      cuerpoDocumento: [{
        numItem: 1, tipoItem: 2, numeroDocumento: null, cantidad: 1, codigo: 'TEST-001',
        codTributo: null, uniMedida: 59, descripcion: 'Producto de prueba iFactu',
        precioUni: gravada, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0,
        ventaGravada: gravada, tributos: null, psv: 0, noGravado: 0, ivaItem: iva,
      }],
      resumen: {
        totalNoSuj: 0, totalExenta: 0, totalGravada: gravada, subTotalVentas: gravada,
        descuNoSuj: 0, descuExenta: 0, descuGravada: 0, porcentajeDescuento: 0, totalDescu: 0,
        tributos: null, subTotal: gravada, ivaRete1: 0, reteRenta: 0, totalIva: iva,
        montoTotalOperacion: gravada, totalNoGravado: 0, totalPagar: gravada,
        totalLetras: montoALetras(gravada), saldoFavor: 0, condicionOperacion: 1,
        pagos: [{ codigo: '01', montoPago: gravada, referencia: null, plazo: null, periodo: null }],
        numPagoElectronico: null,
      },
      extension: null, apendice: null,
    };
  }

  // CCF — Crédito Fiscal (03)
  private buildCcf(amb: string, tipoDte: string, numCtrl: string, codGen: string, fec: string, hor: string, emisor: any, nitEmisor: string) {
    const gravada = 1.00;
    const iva = 0.13;
    const total = 1.13;
    return {
      identificacion: { version: 3, ambiente: amb, tipoDte, numeroControl: numCtrl, codigoGeneracion: codGen, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: fec, horEmi: hor, tipoMoneda: 'USD' },
      documentoRelacionado: null,
      emisor,
      receptor: {
        nit: nitEmisor, nrc: emisor.nrc, nombre: 'RECEPTOR DE PRUEBA S.A. DE C.V.',
        codActividad: emisor.codActividad, descActividad: emisor.descActividad,
        nombreComercial: null, direccion: emisor.direccion, telefono: emisor.telefono, correo: emisor.correo,
      },
      otrosDocumentos: null, ventaTercero: null,
      cuerpoDocumento: [{
        numItem: 1, tipoItem: 2, numeroDocumento: null, cantidad: 1, codigo: 'TEST-001',
        codTributo: null, uniMedida: 59, descripcion: 'Servicio de prueba iFactu',
        precioUni: gravada, montoDescu: 0, ventaNoSuj: 0, ventaExenta: 0,
        ventaGravada: gravada, tributos: ['20'], psv: 0, noGravado: 0,
      }],
      resumen: {
        totalNoSuj: 0, totalExenta: 0, totalGravada: gravada, subTotalVentas: gravada,
        descuNoSuj: 0, descuExenta: 0, descuGravada: 0, porcentajeDescuento: 0, totalDescu: 0,
        tributos: [{ codigo: '20', descripcion: 'Impuesto al Valor Agregado 13%', valor: iva }],
        subTotal: gravada, ivaPerci1: 0, ivaRete1: 0, reteRenta: 0,
        montoTotalOperacion: total, totalNoGravado: 0, totalPagar: total,
        totalLetras: montoALetras(total), saldoFavor: 0, condicionOperacion: 1,
        pagos: [{ codigo: '01', montoPago: total, referencia: null, plazo: null, periodo: null }],
        numPagoElectronico: null,
      },
      extension: null, apendice: null,
    };
  }

  // FSE — Factura Sujeto Excluido (14)
  private buildFse(amb: string, tipoDte: string, numCtrl: string, codGen: string, fec: string, hor: string, emisor: any) {
    const total = 1.00;
    return {
      identificacion: { version: 1, ambiente: amb, tipoDte, numeroControl: numCtrl, codigoGeneracion: codGen, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: fec, horEmi: hor, tipoMoneda: 'USD' },
      emisor,
      sujetoExcluido: {
        tipoDocumento: '13', numDocumento: '00000000-0', nombre: 'SUJETO EXCLUIDO DE PRUEBA',
        codActividad: '00000', descActividad: 'Actividad de prueba',
        direccion: emisor.direccion, telefono: emisor.telefono, correo: emisor.correo,
      },
      cuerpoDocumento: [{
        numItem: 1, tipoItem: 2, cantidad: 1, codigo: 'TEST-001', uniMedida: 59,
        descripcion: 'Servicio de prueba iFactu', precioUni: total, montoDescu: 0,
        compra: total, tributos: null,
      }],
      resumen: {
        totalCompra: total, descu: 0, totalDescu: 0,
        subTotal: total, ivaRete1: 0, reteRenta: 0,
        totalPagar: total, totalLetras: montoALetras(total),
        condicionOperacion: 1,
        pagos: [{ codigo: '01', montoPago: total, referencia: null, plazo: null, periodo: null }],
        numPagoElectronico: null,
      },
      apendice: null,
    };
  }

  // FEXE — Factura de Exportación (11)
  private buildFexe(amb: string, tipoDte: string, numCtrl: string, codGen: string, fec: string, hor: string, emisor: any, nitEmisor: string) {
    const total = 1.00;
    return {
      identificacion: { version: 1, ambiente: amb, tipoDte, numeroControl: numCtrl, codigoGeneracion: codGen, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: fec, horEmi: hor, tipoMoneda: 'USD' },
      documentoRelacionado: null,
      emisor,
      receptor: {
        tipoPersona: 1, nombre: 'TEST FOREIGN BUYER', codPais: 'US',
        nombrePais: 'Estados Unidos', tipoDocumento: '37', numDocumento: '000000000',
        complemento: '123 Test St', nombreComercial: null, telefono: emisor.telefono, correo: emisor.correo,
      },
      otrosDocumentos: null, ventaTercero: null,
      cuerpoDocumento: [{
        numItem: 1, cantidad: 1, codigo: 'TEST-001', uniMedida: 59,
        descripcion: 'Exported service - iFactu test', precioUni: total,
        montoDescu: 0, ventaGravada: total, tributos: null, noGravado: 0,
      }],
      resumen: {
        totalGravada: total, descuento: 0, porcentajeDescuento: 0, totalDescu: 0,
        montoTotalOperacion: total, totalNoGravado: 0,
        totalPagar: total, totalLetras: montoALetras(total),
        condicionOperacion: 1, medioPago: ['01'],
        pagos: [{ codigo: '01', montoPago: total, referencia: null, plazo: null, periodo: null }],
        codIncoterms: 'EXW', descIncoterms: 'En fábrica',
        observaciones: null, flete: 0, seguro: 0,
      },
      apendice: null,
    };
  }

  // Retención (07)
  private buildRetencion(amb: string, tipoDte: string, numCtrl: string, codGen: string, fec: string, hor: string, emisor: any, nitEmisor: string) {
    const total = 0.10;
    return {
      identificacion: { version: 1, ambiente: amb, tipoDte, numeroControl: numCtrl, codigoGeneracion: codGen, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: fec, horEmi: hor, tipoMoneda: 'USD' },
      emisor,
      receptor: {
        nit: nitEmisor, nombre: 'RETENIDO DE PRUEBA S.A.',
        descActividad: emisor.descActividad, correo: emisor.correo, telefono: emisor.telefono,
        nombreComercial: null,
      },
      cuerpoDocumento: [{
        numItem: 1, tipoDte: '01', tipoDoc: 1,
        numDocumento: uuidv4().toUpperCase(),
        fechaEmision: fec, montoSujetoGrav: 1.13, ivaRetenido: total,
        descripcion: 'Retención de prueba iFactu',
      }],
      resumen: { totalSujetoRetencion: 1.13, totalIVAretenido: total, totalIVAretenidoLetras: montoALetras(total) },
      apendice: null,
    };
  }

  // Donación (15)
  private buildDonacion(amb: string, tipoDte: string, numCtrl: string, codGen: string, fec: string, hor: string, emisor: any) {
    const total = 1.00;
    return {
      identificacion: { version: 1, ambiente: amb, tipoDte, numeroControl: numCtrl, codigoGeneracion: codGen, tipoModelo: 1, tipoOperacion: 1, tipoContingencia: null, motivoContin: null, fecEmi: fec, horEmi: hor, tipoMoneda: 'USD' },
      emisor,
      receptor: {
        nombre: 'RECEPTOR DONACIÓN PRUEBA', correo: emisor.correo, telefono: emisor.telefono,
        tipoDocumento: null, numDocumento: null, descripcionActividad: null, direccion: null,
      },
      otrosDocumentos: null,
      cuerpoDocumento: [{
        numItem: 1, tipoItem: 2, cantidad: 1, codigo: 'DON-001', uniMedida: 59,
        descripcion: 'Donación de prueba iFactu', precioUni: total, montoDescu: 0,
        ventaNoSuj: 0, ventaExenta: 0, ventaGravada: total, tributos: null,
      }],
      resumen: {
        totalNoSuj: 0, totalExenta: 0, totalGravada: total,
        montoTotalOperacion: total, totalLetras: montoALetras(total),
      },
      apendice: null,
    };
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private async getEmpresaPruebas(empresaId: string): Promise<Empresa> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    if (empresa.mhAmbiente === '01') throw new Error('Esta empresa está en ambiente de producción. Las pruebas solo están disponibles en ambiente de pruebas (00).');
    return empresa;
  }
}
