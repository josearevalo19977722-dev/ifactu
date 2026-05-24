import {
  Controller, Get, Post, Put, Patch, Delete, Query, Param, Body,
  UseGuards, Request, BadRequestException, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ExtensionLicenseService } from './extension-license.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { RolUsuario } from '../usuarios/usuario.entity';

@Controller()
export class ExtensionLicenseController {
  constructor(private readonly svc: ExtensionLicenseService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Endpoints públicos (sin auth) — usados directamente por la extensión
  // ══════════════════════════════════════════════════════════════════════════

  /** GET /api/extension/validate?key=XXX */
  @Get('extension/validate')
  async validate(@Query('key') key: string) {
    return this.svc.validar(key ?? '');
  }

  /**
   * POST /api/licencias/activar
   * Registra el dispositivo en el backend (fire-and-forget desde options.js).
   * Body: { clave, fingerprint, nombre_dispositivo }
   */
  @Post('licencias/activar')
  async activar(@Body() body: { clave: string; fingerprint: string; nombre_dispositivo?: string }) {
    if (!body.clave || !body.fingerprint) {
      return { success: false, error: 'clave y fingerprint son requeridos' };
    }
    return this.svc.activarDispositivo(body);
  }

  /**
   * POST /api/licencias/registrar-uso
   * Incrementa el contador de DTEs del mes (fire-and-forget desde background.js).
   * Body: { clave, fingerprint?, cantidad }
   */
  @Post('licencias/registrar-uso')
  async registrarUso(@Body() body: { clave: string; fingerprint?: string; cantidad?: number }) {
    if (!body.clave) return { ok: false, error: 'clave es requerida' };
    return this.svc.registrarUso({
      clave:       body.clave,
      fingerprint: body.fingerprint,
      cantidad:    body.cantidad ?? 1,
    });
  }

  /**
   * GET /api/extension/planes
   * Lista los planes disponibles para la página pública de compra.
   */
  @Get('extension/planes')
  planesPublicos() {
    return this.svc.listarPlanes();
  }

  /**
   * GET /api/extension/checkout/:tipo?email=xxx
   * Redirige al link de pago N1CO del plan seleccionado.
   * El usuario llega aquí desde la página de marketing.
   */
  @Get('extension/checkout/:tipo')
  async checkout(
    @Param('tipo') tipo: string,
    @Query('email') email: string | undefined,
    @Res() res: Response,
  ) {
    const { url } = await this.svc.obtenerLinkPago(tipo, email);
    return res.redirect(302, url);
  }

  /**
   * POST /api/extension/webhook/n1co
   * Recibe la notificación de pago de N1CO y activa/crea la licencia.
   * Comparte lógica HMAC con el webhook de billing si es necesario.
   */
  @Post('extension/webhook/n1co')
  async webhookN1co(@Body() payload: any) {
    await this.svc.procesarPagoN1co(payload);
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Endpoints para el CONTADOR logueado en iFactu
  // ══════════════════════════════════════════════════════════════════════════

  /** GET /api/extension/mi-licencia */
  @Get('extension/mi-licencia')
  @UseGuards(JwtAuthGuard)
  async miLicencia(@Request() req: any) {
    const lic = await this.svc.obtenerDeUsuario(req.user.sub);
    if (!lic) return { licencia: null };
    return {
      licencia: {
        apiKey:          lic.apiKey,
        activa:          lic.activa,
        plan:            lic.plan,
        maxDtesMes:      lic.maxDtesMes,
        dtesUsadosMes:   lic.dtesUsadosMes,
        expiresAt:       lic.expiresAt,
        createdAt:       lic.createdAt,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Superadmin — gestión de licencias
  // ══════════════════════════════════════════════════════════════════════════

  /** GET /api/extension/licencias */
  @Get('extension/licencias')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listar() {
    return this.svc.listar();
  }

  /** POST /api/extension/licencias */
  @Post('extension/licencias')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async crear(
    @Body() body: {
      nombre: string;
      email: string;
      origen?: 'ifactu' | 'n1co';
      plan?: string;
      maxDtesMes?: number;
      expiresAt?: string;
      usuarioId?: string;
    },
  ) {
    if (!body.nombre || !body.email) throw new BadRequestException('nombre y email son requeridos');
    return this.svc.crear({
      nombre:     body.nombre,
      email:      body.email,
      origen:     body.origen ?? 'n1co',
      plan:       body.plan,
      maxDtesMes: body.maxDtesMes,
      expiresAt:  body.expiresAt ? new Date(body.expiresAt) : undefined,
      usuarioId:  body.usuarioId || undefined,
    });
  }

  /** PATCH /api/extension/licencias/:id */
  @Patch('extension/licencias/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async actualizar(
    @Param('id') id: string,
    @Body() body: { plan?: string; maxDtesMes?: number; expiresAt?: string; nombre?: string; email?: string },
  ) {
    return this.svc.actualizar(id, {
      plan:       body.plan,
      maxDtesMes: body.maxDtesMes,
      expiresAt:  body.expiresAt ? new Date(body.expiresAt) : undefined,
      nombre:     body.nombre,
      email:      body.email,
    });
  }

  /** PATCH /api/extension/licencias/:id/regenerar-clave */
  @Patch('extension/licencias/:id/regenerar-clave')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async regenerarClave(@Param('id') id: string) {
    return this.svc.regenerarClave(id);
  }

  /** PATCH /api/extension/licencias/:id/revocar */
  @Patch('extension/licencias/:id/revocar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async revocar(@Param('id') id: string) {
    await this.svc.revocar(id);
    return { ok: true };
  }

  /** PATCH /api/extension/licencias/:id/reactivar */
  @Patch('extension/licencias/:id/reactivar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async reactivar(@Param('id') id: string) {
    await this.svc.reactivar(id);
    return { ok: true };
  }

  /** GET /api/extension/licencias/:id/dispositivos */
  @Get('extension/licencias/:id/dispositivos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listarDispositivos(@Param('id') id: string) {
    return this.svc.listarDispositivos(id);
  }

  /** DELETE /api/extension/licencias/:id/dispositivos/:deviceId */
  @Delete('extension/licencias/:id/dispositivos/:deviceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async revocarDispositivo(@Param('deviceId') deviceId: string) {
    await this.svc.revocarDispositivo(deviceId);
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Superadmin — gestión de planes
  // ══════════════════════════════════════════════════════════════════════════

  /** GET /api/extension/admin/planes */
  @Get('extension/admin/planes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listarPlanesAdmin() {
    return this.svc.listarPlanesAdmin();
  }

  /** PUT /api/extension/admin/planes/:tipo */
  @Put('extension/admin/planes/:tipo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async upsertPlan(
    @Param('tipo') tipo: string,
    @Body() body: {
      nombre?: string;
      descripcion?: string;
      precio?: number;
      maxDtesMes?: number;
      maxDispositivos?: number;
      n1coPlanId?: number;
      paymentLinkUrl?: string;
      activo?: boolean;
    },
  ) {
    return this.svc.upsertPlan({ tipo, ...body });
  }

  /** DELETE /api/extension/admin/planes/:tipo */
  @Delete('extension/admin/planes/:tipo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async eliminarPlan(@Param('tipo') tipo: string) {
    await this.svc.eliminarPlan(tipo);
    return { ok: true };
  }
}
