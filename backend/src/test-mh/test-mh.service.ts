import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Empresa } from '../empresa/entities/empresa.entity';
import { AuthMhService } from '../auth-mh/auth-mh.service';
import { CfService } from '../dte/services/cf.service';
import { CcfService } from '../dte/services/ccf.service';
import { FseService } from '../dte/services/fse.service';
import { FexeService } from '../dte/services/fexe.service';
import { RetencionService } from '../dte/services/retencion.service';
import { DonacionService } from '../dte/services/donacion.service';
import { NotaService } from '../dte/services/nota.service';
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
    private readonly authMh: AuthMhService,
    private readonly cfService: CfService,
    private readonly ccfService: CcfService,
    private readonly fseService: FseService,
    private readonly fexeService: FexeService,
    private readonly retencionService: RetencionService,
    private readonly donacionService: DonacionService,
    private readonly notaService: NotaService,
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

  async probarDte(empresaId: string, tipoDte: string, receptorOverride?: Record<string, any>): Promise<TestDteResult> {
    const empresa = await this.getEmpresaPruebas(empresaId);
    return this.emitirDtePrueba(empresa, tipoDte, receptorOverride);
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
      };
    } catch (err: any) {
      return { exitoso: false, tipoDte, error: err.message ?? 'Error desconocido', tiempoMs: Date.now() - inicio };
    }
  }

  // ── NC/ND: requieren un CCF de referencia — emitimos uno primero ─────────

  private async emitirNotaPrueba(empresa: Empresa, tipoDte: '05' | '06', o?: Record<string, any>): Promise<any> {
    let ccf: any;
    try {
      ccf = await this.ccfService.emitir(this.dtoCcf(empresa, o), empresa.id);
    } catch (err: any) {
      throw new Error(`No se pudo emitir el CCF de referencia: ${err.message ?? err}`);
    }
    if (ccf.estado !== 'RECIBIDO') {
      const detalle = ccf.descripcionMsg ?? ccf.observaciones ?? 'sin detalles de Hacienda';
      throw new Error(`CCF de referencia rechazado por Hacienda: ${detalle}`);
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
    const nit = o?.nit?.replace(/-/g, '') ?? '06140101011034';
    const nrc = o?.nrc?.replace(/-/g, '') ?? '2';
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
    const nit = o?.nit?.replace(/-/g, '') ?? '06140101011034';
    const nrc = o?.nrc?.replace(/-/g, '') ?? '2';
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
        numDocumento: o?.numDocumento ?? '06140101011034',
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

  // ── Helper ────────────────────────────────────────────────────────────────

  private async getEmpresaPruebas(empresaId: string): Promise<Empresa> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    if (empresa.mhAmbiente === '01') throw new Error('Esta empresa está en producción. Las pruebas solo están disponibles en ambiente 00.');
    return empresa;
  }
}
