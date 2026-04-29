import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { LimiteDtesGuard } from '../guards/limite-dtes.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, Brackets } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { svDateTime } from '../../utils/sv-datetime';
import { CfService } from '../services/cf.service';
import { CcfService } from '../services/ccf.service';
import { InvalidacionService } from '../services/invalidacion.service';
import { PdfService } from '../services/pdf.service';
import { ConsultaMhService } from '../services/consulta-mh.service';
import { NotaService } from '../services/nota.service';
import { ContingenciaService } from '../services/contingencia.service';
import { FexeService } from '../services/fexe.service';
import { NreService } from '../services/nre.service';
import { RetencionService } from '../services/retencion.service';
import { FseService } from '../services/fse.service';
import { DonacionService } from '../services/donacion.service';
import { CreateFexeDto } from '../dto/create-fexe.dto';
import { CreateNreDto } from '../dto/create-nre.dto';
import { CreateRetencionDto } from '../dto/create-retencion.dto';
import { CreateFseDto } from '../dto/create-fse.dto';
import { CreateDonacionDto } from '../dto/create-donacion.dto';
import { CreateNotaDto } from '../dto/create-nota.dto';
import { CreateCfDto } from '../dto/create-cf.dto';
import { CreateCcfDto } from '../dto/create-ccf.dto';
import { InvalidarDteDto } from '../dto/invalidar-dte.dto';
import { Dte } from '../entities/dte.entity';
import { RolUsuario } from '../../usuarios/usuario.entity';

@UseGuards(JwtAuthGuard)
@Controller('dte')
export class DteController {
  constructor(
    private readonly cfService: CfService,
    private readonly ccfService: CcfService,
    private readonly invalidacionService: InvalidacionService,
    private readonly pdfService: PdfService,
    private readonly consultaMhService: ConsultaMhService,
    private readonly notaService: NotaService,
    private readonly contingenciaService: ContingenciaService,
    private readonly fexeService: FexeService,
    private readonly nreService: NreService,
    private readonly retencionService: RetencionService,
    private readonly fseService: FseService,
    private readonly donacionService: DonacionService,
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly configService: ConfigService,
  ) {}

  @Post('cf')
  @UseGuards(LimiteDtesGuard)
  emitirCf(@Body() dto: CreateCfDto, @Req() req: any) {
    return this.cfService.emitir(dto, req.user.empresaId, dto.codEstable, dto.codPuntoVenta);
  }

  @Post('ccf')
  @UseGuards(LimiteDtesGuard)
  emitirCcf(@Body() dto: CreateCcfDto, @Req() req: any) {
    return this.ccfService.emitir(dto, req.user.empresaId, dto.codEstable, dto.codPuntoVenta);
  }

  @Post('nc')
  @UseGuards(LimiteDtesGuard)
  emitirNc(@Body() dto: CreateNotaDto, @Req() req: any) {
    return this.notaService.emitirNc(dto, req.user.empresaId);
  }

  @Post('nd')
  @UseGuards(LimiteDtesGuard)
  emitirNd(@Body() dto: CreateNotaDto, @Req() req: any) {
    return this.notaService.emitirNd(dto, req.user.empresaId);
  }

  @Post('fexe')
  @UseGuards(LimiteDtesGuard)
  emitirFexe(@Body() dto: CreateFexeDto, @Req() req: any) {
    return this.fexeService.emitir(dto, req.user.empresaId);
  }

  @Post('nre')
  @UseGuards(LimiteDtesGuard)
  emitirNre(@Body() dto: CreateNreDto, @Req() req: any) {
    return this.nreService.emitir(dto, req.user.empresaId);
  }

  @Post('retencion')
  @UseGuards(LimiteDtesGuard)
  emitirRetencion(@Body() dto: CreateRetencionDto, @Req() req: any) {
    return this.retencionService.emitir(dto, req.user.empresaId);
  }

  @Post('fse')
  @UseGuards(LimiteDtesGuard)
  emitirFse(@Body() dto: CreateFseDto, @Req() req: any) {
    return this.fseService.emitir(dto, req.user.empresaId);
  }

  @Post('donacion')
  @UseGuards(LimiteDtesGuard)
  emitirDonacion(@Body() dto: CreateDonacionDto, @Req() req: any) {
    return this.donacionService.emitir(dto, req.user.empresaId);
  }

  // ── Contingencia ──────────────────────────────────────────────────────────

  @Get('dashboard/stats')
  async dashboardStats(@Req() req: any) {
    const { empresaId, rol } = req.user;
    const isSuper = rol === RolUsuario.SUPERADMIN;
    const filter = isSuper ? {} : { empresa: { id: empresaId } };

    const [total, porEstado, porTipo, ultimosMeses] = await Promise.all([
      this.dteRepo.count({ where: filter }),
      this.dteRepo
        .createQueryBuilder('dte')
        .select('dte.estado', 'estado')
        .addSelect('COUNT(*)', 'cantidad')
        .addSelect('SUM(dte.totalPagar)', 'monto')
        .where(isSuper ? '1=1' : 'dte.empresaId = :empresaId', { empresaId })
        .groupBy('dte.estado')
        .getRawMany(),
      this.dteRepo
        .createQueryBuilder('dte')
        .select('dte.tipoDte', 'tipoDte')
        .addSelect('COUNT(*)', 'cantidad')
        .where(isSuper ? '1=1' : 'dte.empresaId = :empresaId', { empresaId })
        .groupBy('dte.tipoDte')
        .getRawMany(),
      this.dteRepo
        .createQueryBuilder('dte')
        .select("TO_CHAR(dte.\"fechaEmision\", 'YYYY-MM')", 'mes')
        .addSelect('COUNT(*)', 'cantidad')
        .addSelect('SUM(dte."totalPagar")', 'monto')
        .where(isSuper 
          ? "dte.\"fechaEmision\" >= NOW() - INTERVAL '6 months'"
          : "dte.empresaId = :empresaId AND dte.\"fechaEmision\" >= NOW() - INTERVAL '6 months'", 
          isSuper ? {} : { empresaId }
        )
        .groupBy("TO_CHAR(dte.\"fechaEmision\", 'YYYY-MM')")
        .orderBy("TO_CHAR(dte.\"fechaEmision\", 'YYYY-MM')", 'ASC')
        .getRawMany(),
    ]);
    return { total, porEstado, porTipo, ultimosMeses };
  }

  @Get('contingencia/cola')
  obtenerCola(@Req() req: any) {
    return this.contingenciaService.obtenerCola(req.user.empresaId);
  }

  /** Superadmin: cola global de contingencia de todos los tenants */
  @Get('contingencia/global')
  obtenerColaGlobal(@Req() req: any) {
    if (req.user.rol !== RolUsuario.SUPERADMIN) {
      throw new ForbiddenException('Solo el superadmin puede ver la cola global');
    }
    return this.contingenciaService.obtenerColaGlobal();
  }

  @Post('contingencia/procesar')
  procesarCola(@Body() body: { tipoContingencia: number; motivoContingencia: string }, @Req() req: any) {
    return this.contingenciaService.procesarCola(body.tipoContingencia, body.motivoContingencia, req.user.empresaId);
  }

  /**
   * Consulta el estado de un lote enviado en contingencia.
   * Manual MH sección 4.3.2: el MH procesa un lote en 2-3 minutos.
   * Llamar periódicamente hasta que actualizados + rechazados === total del lote.
   * GET /api/dte/contingencia/lote/:codigoLote
   */
  @Get('contingencia/lote/:codigoLote')
  consultarLote(@Param('codigoLote') codigoLote: string, @Req() req: any) {
    return this.contingenciaService.consultarResultadoLote(codigoLote, req.user.empresaId);
  }

  /**
   * SOLO DESARROLLO — crea N DTEs de prueba en estado CONTINGENCIA para
   * poder probar el flujo completo sin necesitar certificado ni credenciales MH.
   * Bloqueado en NODE_ENV=production.
   *
   * POST /api/dte/dev/test-contingencia
   * Body: { cantidad?: number }  (default 3)
   */
  @Post('dev/test-contingencia')
  async crearDtesTestContingencia(
    @Body() body: { cantidad?: number },
    @Req() req: any,
  ) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Este endpoint solo está disponible en desarrollo');
    }

    const { empresaId } = req.user;
    const cantidad = Math.min(body.cantidad ?? 3, 20);
    const { fecEmi } = svDateTime();
    const creados: Dte[] = [];

    for (let i = 0; i < cantidad; i++) {
      const codigoGeneracion = uuidv4().toUpperCase();
      const seq = String(i + 1).padStart(15, '0');
      const dte = this.dteRepo.create({
        tipoDte:          '01',
        numeroControl:    `DTE-01-TEST-PRUEBA-${seq}`,
        codigoGeneracion,
        jsonDte: {
          identificacion: {
            version: 1, ambiente: '00', tipoDte: '01',
            numeroControl: `DTE-01-TEST-PRUEBA-${seq}`,
            codigoGeneracion, tipoModelo: 1, tipoOperacion: 1,
            tipoContingencia: null, motivoContin: null,
            fecEmi, horEmi: '10:00:00', tipoMoneda: 'USD',
          },
          emisor:   { nombre: 'EMPRESA TEST' },
          receptor: null,
          resumen:  { totalPagar: 11.30 + i },
        },
        firmado:       '{"firma":"TEST_FIRMA_DESARROLLO"}',
        fechaEmision:  fecEmi,
        totalPagar:    11.30 + i,
        receptorNombre: `CLIENTE TEST ${i + 1}`,
        estado:        'CONTINGENCIA' as any,
        observaciones: 'DTE de prueba creado por endpoint de desarrollo',
        empresa:       { id: empresaId } as any,
      });
      creados.push(await this.dteRepo.save(dte));
    }

    return {
      message: `✅ ${creados.length} DTE(s) de prueba creados en estado CONTINGENCIA`,
      ids: creados.map(d => d.id),
      instrucciones: [
        '1. Ve a la página de Contingencia en el frontend',
        '2. Verás los DTEs en la cola',
        '3. Completa el motivo y haz clic en "Transmitir al MH"',
        '4. Si MODO_DEMO=true la respuesta del MH será simulada',
        '5. Los DTEs pasarán a estado PENDIENTE con su codigoLote',
        '6. Usa el botón "Consultar MH" para verificar el resultado',
      ],
    };
  }

  @Post(':id/reintentar')
  reintentar(@Param('id') id: string) {
    return this.contingenciaService.reintentarIndividual(id);
  }

  @Get()
  listar(
    @Req() req: any,
    @Query('tipoDte') tipoDte?: string,
    @Query('estado') estado?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('empresaId') filterEmpresaId?: string,
  ) {
    const skip = (Number(page) - 1) * Number(limit);
    const { empresaId, rol } = req.user;
    const isSuper = rol === RolUsuario.SUPERADMIN;
    const qb = this.dteRepo.createQueryBuilder('dte')
      .leftJoinAndSelect('dte.empresa', 'empresa');

    if (!isSuper) {
      qb.andWhere('dte.empresaId = :empresaId', { empresaId });
    } else if (filterEmpresaId) {
      // Superadmin filtrando por empresa específica
      qb.andWhere('dte.empresaId = :filterEmpresaId', { filterEmpresaId });
    }

    if (tipoDte) qb.andWhere('dte.tipoDte = :tipoDte', { tipoDte });
    if (estado)  qb.andWhere('dte.estado = :estado',   { estado });
    if (q) {
      const term = `%${q.toLowerCase()}%`;
      qb.andWhere(new Brackets(w => {
        w.where('LOWER(dte.receptorNombre) LIKE :term', { term })
          .orWhere('LOWER(dte.numeroControl) LIKE :term', { term })
          .orWhere('LOWER(dte.codigoGeneracion) LIKE :term', { term })
          .orWhere('LOWER(empresa.nombreLegal) LIKE :term', { term });
      }));
    }

    return qb
      .orderBy('dte.createdAt', 'DESC')
      .skip(skip)
      .take(Number(limit))
      .getManyAndCount();
  }

  @Get('exportar/csv')
  async exportarCsv(
    @Req() req: any,
    @Query('tipoDte') tipoDte?: string,
    @Query('estado') estado?: string,
    @Query('q') q?: string,
    @Res() res?: Response,
  ) {
    const { empresaId, rol } = req.user;
    const isSuper = rol === RolUsuario.SUPERADMIN;
    const qb = this.dteRepo.createQueryBuilder('dte');
    
    if (!isSuper) {
      qb.andWhere('dte.empresaId = :empresaId', { empresaId });
    }
    if (tipoDte) qb.andWhere('dte.tipoDte = :tipoDte', { tipoDte });
    if (estado)  qb.andWhere('dte.estado = :estado',   { estado });
    if (q) {
      const term = `%${q.toLowerCase()}%`;
      qb.andWhere(new Brackets(w => {
        w.where('LOWER(dte.receptorNombre) LIKE :term', { term })
          .orWhere('LOWER(dte.numeroControl) LIKE :term', { term });
      }));
    }
    const dtes = await qb.orderBy('dte.createdAt', 'DESC').getMany();

    const rows = dtes.map(d => {
      const json = d.jsonDte as any;
      const res = json?.resumen || {};
      const data: any = {
        tipoDte: d.tipoDte,
        numeroControl: d.numeroControl,
        codigoGeneracion: d.codigoGeneracion,
        fechaEmision: d.fechaEmision,
        receptorNombre: d.receptorNombre,
        nrc: json?.receptor?.nrc || '',
        totalGravada: res.totalGravada || 0,
        totalExenta: res.totalExenta || 0,
        totalIva: res.totalIva || res.tributos?.find((t:any) => t.codigo === '20')?.valor || 0,
        ivaRete1: res.ivaRete1 || 0,
        totalPagar: d.totalPagar,
        estado: d.estado,
        selloRecepcion: d.selloRecepcion || ''
      };

      return [
        data.tipoDte, data.numeroControl, data.codigoGeneracion, data.fechaEmision,
        `"${String(data.receptorNombre).replace(/"/g, '""')}"`,
        data.nrc, data.totalGravada, data.totalExenta, data.totalIva, data.ivaRete1,
        data.totalPagar, data.estado, data.selloRecepcion
      ].join(',');
    });

    const header = 'Tipo,N° Control,Cód. Generación,Fecha,Receptor,NRC,Gravada,Exenta,IVA,Retención 1%,Total,Estado,Sello MH';
    const csv = [header, ...rows].join('\r\n');

    res!.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dtes-${new Date().toISOString().split('T')[0]}.csv"`,
    });
    res!.end('\uFEFF' + csv); // BOM para Excel
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Req() req: any) {
    const { empresaId, rol } = req.user;
    const where: any = { id };
    if (rol !== RolUsuario.SUPERADMIN) {
      where.empresa = { id: empresaId };
    }
    return this.dteRepo.findOneOrFail({ where });
  }

  @Post(':id/consultar-mh')
  consultarMh(@Param('id') id: string) {
    return this.consultaMhService.consultar(id);
  }

  @Post(':id/anular')
  anular(@Param('id') id: string, @Body() dto: Omit<InvalidarDteDto, 'dteId'>, @Req() req: any) {
    return this.invalidacionService.anular({ ...dto, dteId: id }, req.user.empresaId);
  }

  @Get(':id/pdf')
  async descargarPdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const { empresaId, rol } = req.user;
    const where: any = { id };
    if (rol !== RolUsuario.SUPERADMIN) {
      where.empresa = { id: empresaId };
    }
    // Validar propiedad antes de generar
    await this.dteRepo.findOneOrFail({ where });
    
    const buffer = await this.pdfService.generarPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="DTE-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
