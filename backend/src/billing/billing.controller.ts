import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Request,
  UseGuards, RawBodyRequest, Req, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { N1coService } from './n1co.service';
import { PaquetesExtrasService, PRECIOS_EXTRA } from './paquetes-extras.service';
import { PaqueteCatalogo } from './entities/paquete-catalogo.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { RolUsuario } from '../usuarios/usuario.entity';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly n1co: N1coService,
    private readonly paquetesExtras: PaquetesExtrasService,
    private readonly config: ConfigService,
    @InjectRepository(PaqueteCatalogo)
    private readonly catalogoRepo: Repository<PaqueteCatalogo>,
  ) {}

  // ── Endpoints para tenants (autenticados) ────────────────────────────────

  @Get('mi-plan')
  @UseGuards(JwtAuthGuard)
  miPlan(@Request() req: any) {
    return this.billing.miPlan(req.user.empresaId);
  }

  @Post('iniciar-pago')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  iniciarPago(
    @Request() req: any,
    @Body() body: { planTipo: string },
  ) {
    return this.billing.iniciarPago(req.user.empresaId, body.planTipo);
  }

  @Get('verificar/:pagoId')
  @UseGuards(JwtAuthGuard)
  verificarPago(@Param('pagoId') pagoId: string) {
    return this.billing.verificarPago(pagoId);
  }

  @Get('historial')
  @UseGuards(JwtAuthGuard)
  historial(@Request() req: any) {
    return this.billing.historial(req.user.empresaId);
  }

  @Get('planes')
  @UseGuards(JwtAuthGuard)
  planesDisponibles() {
    return this.billing.listarPlanesConfig();
  }

  // ── Webhook N1CO (público) ───────────────────────────────────────────────

  @Post('webhook/n1co')
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const secret = this.config.get<string>('N1CO_WEBHOOK_SECRET');

    // Verificar firma HMAC-SHA256 si el secreto está configurado
    if (secret) {
      const sigHeader =
        (req.headers as any)['x-n1co-signature'] ??
        (req.headers as any)['x-signature'] ??
        (req.headers as any)['x-webhook-signature'];

      if (!sigHeader) {
        throw new UnauthorizedException('Webhook sin firma');
      }

      const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify((req as any).body));
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      const received = sigHeader.toString().replace(/^sha256=/, '');

      try {
        const expectedBuf = Buffer.from(expected, 'hex');
        const receivedBuf = Buffer.from(received, 'hex');
        if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
          throw new UnauthorizedException('Firma de webhook inválida');
        }
      } catch {
        throw new UnauthorizedException('Firma de webhook inválida');
      }
    }

    const payload = (req as any).body;
    await this.billing.procesarWebhook(payload);
    return { ok: true };
  }

  // ── Superadmin: Planes Config ────────────────────────────────────────────

  /** Lista todos los planes configurados */
  @Get('admin/planes-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listarPlanesConfig() {
    return this.billing.listarPlanesConfig();
  }

  /** Crea un nuevo plan personalizado */
  @Post('admin/planes-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  crearPlan(
    @Body() body: {
      tipo?: string;
      nombre: string;
      descripcion: string;
      precioMensual: number;
      limiteDtesMensuales: number;
      limiteUsuarios: number;
      n1coPlanId?: number;
      paymentLinkUrl?: string;
      activo?: boolean;
      esPlanInicial?: boolean;
    },
  ) {
    return this.billing.crearPlan(body);
  }

  /** Actualiza precio, límites y config de un plan */
  @Put('admin/planes-config/:tipo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  actualizarPlanConfig(
    @Param('tipo') tipo: string,
    @Body() body: {
      nombre?: string;
      descripcion?: string;
      precioMensual?: number;
      limiteDtesMensuales?: number;
      limiteUsuarios?: number;
      n1coPlanId?: number;
      paymentLinkUrl?: string;
      activo?: boolean;
      esPlanInicial?: boolean;
    },
  ) {
    return this.billing.actualizarPlanConfig(tipo, body);
  }

  /** Marca un plan como el plan inicial para nuevas empresas */
  @Put('admin/planes-config/:tipo/inicial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  marcarPlanInicial(@Param('tipo') tipo: string) {
    return this.billing.marcarPlanInicial(tipo);
  }

  /** Elimina un plan personalizado (no aplica a los 3 estándar) */
  @Delete('admin/planes-config/:tipo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  eliminarPlan(@Param('tipo') tipo: string) {
    return this.billing.eliminarPlan(tipo);
  }

  /** Crea el plan en N1CO y guarda planId + paymentLinkUrl en la BD */
  @Post('admin/planes-config/:tipo/crear-plan-n1co')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  crearPlanN1co(@Param('tipo') tipo: string) {
    return this.billing.crearPlanN1co(tipo);
  }

  // ── Superadmin: Pagos / N1CO ─────────────────────────────────────────────

  @Get('admin/pagos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  historialGlobal() {
    return this.billing.historialGlobal();
  }

  @Get('admin/n1co/planes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listarPlanesN1co() {
    return this.n1co.listarPlanes();
  }

  @Get('admin/n1co/ordenes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listarOrdenesN1co() {
    return this.n1co.listarOrdenes();
  }

  /** Asigna un plan manualmente a una empresa (sin cobro) */
  @Post('admin/asignar-plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  asignarPlanManual(
    @Body() body: { empresaId: string; planTipo: string; meses?: number },
  ) {
    return this.billing.asignarPlanManual(body.empresaId, body.planTipo, body.meses ?? 1);
  }

  // ── Catálogo de paquetes extras ──────────────────────────────────────────

  /** Lista opciones activas del catálogo (para el modal de empresa) */
  @Get('paquetes-extras/catalogo')
  @UseGuards(JwtAuthGuard)
  async getCatalogo() {
    const items = await this.catalogoRepo.find({
      where: { activo: true },
      order: { orden: 'ASC', cantidad: 'ASC' },
    });
    // Si no hay nada en BD, devolver los valores por defecto
    if (items.length === 0) {
      return Object.entries(PRECIOS_EXTRA).map(([cantidad, precio], i) => ({
        id: null, nombre: null, cantidad: Number(cantidad), precio, orden: i, activo: true,
      }));
    }
    return items;
  }

  /** SUPERADMIN: listar todo el catálogo (activos e inactivos) */
  @Get('admin/paquetes-catalogo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async listarCatalogo() {
    return this.catalogoRepo.find({ order: { orden: 'ASC', cantidad: 'ASC' } });
  }

  /** SUPERADMIN: crear opción en el catálogo */
  @Post('admin/paquetes-catalogo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async crearOpcionCatalogo(
    @Body() body: { nombre?: string; cantidad: number; precio: number; orden?: number; activo?: boolean },
  ) {
    const item = this.catalogoRepo.create({
      nombre: body.nombre ?? null,
      cantidad: body.cantidad,
      precio: body.precio,
      orden: body.orden ?? 0,
      activo: body.activo !== false,
    });
    return this.catalogoRepo.save(item);
  }

  /** SUPERADMIN: actualizar opción del catálogo */
  @Patch('admin/paquetes-catalogo/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async actualizarOpcionCatalogo(
    @Param('id') id: string,
    @Body() body: { nombre?: string; cantidad?: number; precio?: number; orden?: number; activo?: boolean },
  ) {
    await this.catalogoRepo.update(id, body);
    return this.catalogoRepo.findOne({ where: { id } });
  }

  /** SUPERADMIN: eliminar opción del catálogo */
  @Delete('admin/paquetes-catalogo/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async eliminarOpcionCatalogo(@Param('id') id: string) {
    await this.catalogoRepo.delete(id);
    return { ok: true };
  }

  /**
   * SUPERADMIN: auto-crea los dos planes N1CO (una-vez y permanente)
   * para un ítem del catálogo y guarda los IDs y links en la BD.
   */
  @Post('admin/paquetes-catalogo/:id/crear-planes-n1co')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async crearPlanesN1coParaCatalogo(@Param('id') id: string) {
    const item = await this.catalogoRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Ítem del catálogo no encontrado');
    }

    const planes = await this.n1co.crearPlanesParaExtra({
      cantidad: item.cantidad,
      precio:   Number(item.precio),
      nombre:   item.nombre ?? undefined,
    });

    await this.catalogoRepo.update(id, {
      n1coPlanIdUnaVez:      planes.unaVez.planId,
      paymentLinkUnaVez:     planes.unaVez.paymentLinkUrl,
      n1coPlanIdPermanente:  planes.permanente.planId,
      paymentLinkPermanente: planes.permanente.paymentLinkUrl,
    });

    return this.catalogoRepo.findOne({ where: { id } });
  }

  // ── Paquetes Extra DTEs (tenant) ─────────────────────────────────────────

  /** DTEs extras disponibles + tabla de precios */
  @Get('paquetes-extras/disponibles')
  @UseGuards(JwtAuthGuard)
  paquetesDisponibles(@Request() req: any) {
    return this.paquetesExtras.getDisponibles(req.user.empresaId).then(res => ({
      ...res,
      precios: PRECIOS_EXTRA,
    }));
  }

  /** Solicitar un paquete extra (queda en PENDIENTE hasta que admin lo active) */
  @Post('paquetes-extras/solicitar')
  @UseGuards(JwtAuthGuard)
  solicitarPaquete(
    @Request() req: any,
    @Body() body: { cantidad: number; esPermanente: boolean; notas?: string },
  ) {
    return this.paquetesExtras.crearSolicitud(req.user.empresaId, body);
  }

  /** Iniciar pago N1CO para un paquete extra del catálogo */
  @Post('paquetes-extras/iniciar-pago')
  @UseGuards(JwtAuthGuard)
  iniciarPagoExtra(
    @Request() req: any,
    @Body() body: { catalogoId: string; esPermanente: boolean },
  ) {
    return this.billing.iniciarPagoExtra(req.user.empresaId, body);
  }

  /** Historial de paquetes extras de la empresa actual */
  @Get('paquetes-extras/historial')
  @UseGuards(JwtAuthGuard)
  historialPaquetes(@Request() req: any) {
    return this.paquetesExtras.listarPorEmpresa(req.user.empresaId);
  }

  // ── Paquetes Extra DTEs (superadmin) ────────────────────────────────────

  /** Lista todos los paquetes (todos los estados) */
  @Get('admin/paquetes-extras')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listarPaquetesAdmin() {
    return this.paquetesExtras.listarTodos(false);
  }

  /** Superadmin crea un paquete para cualquier empresa (activación opcional inmediata) */
  @Post('admin/paquetes-extras')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async crearPaqueteAdmin(
    @Body() body: {
      empresaId: string;
      cantidad: number;
      precio?: number;
      esPermanente: boolean;
      notas?: string;
      activarInmediatamente?: boolean;
    },
  ) {
    const paquete = await this.paquetesExtras.crearPaqueteLibre(body.empresaId, {
      cantidad: body.cantidad,
      precio: body.precio ?? 0,
      esPermanente: body.esPermanente,
      notas: body.notas,
    });
    if (body.activarInmediatamente) {
      return this.paquetesExtras.activarPaquete(paquete.id);
    }
    return paquete;
  }

  /** Activa un paquete pendiente (marca como PAGADO) */
  @Post('admin/paquetes-extras/:id/activar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  activarPaquete(@Param('id') id: string) {
    return this.paquetesExtras.activarPaquete(id);
  }

  /** Modifica cantidad, precio, tipo o notas de un paquete PENDIENTE */
  @Patch('admin/paquetes-extras/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  actualizarPaquete(
    @Param('id') id: string,
    @Body() body: { cantidad?: number; precio?: number; esPermanente?: boolean; notas?: string },
  ) {
    return this.paquetesExtras.actualizarPaquete(id, body);
  }

  /** Cancela un paquete */
  @Post('admin/paquetes-extras/:id/cancelar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  cancelarPaquete(@Param('id') id: string) {
    return this.paquetesExtras.cancelarPaquete(id);
  }
}
