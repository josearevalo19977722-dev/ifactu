import {
  Controller, Get, Post, Patch, Query, Param, Body,
  UseGuards, Request, BadRequestException,
} from '@nestjs/common';
import { ExtensionLicenseService } from './extension-license.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { RolUsuario } from '../usuarios/usuario.entity';

@Controller('extension')
export class ExtensionLicenseController {
  constructor(private readonly svc: ExtensionLicenseService) {}

  /** GET /api/extension/validate?key=XXX — público, sin auth */
  @Get('validate')
  async validate(@Query('key') key: string) {
    return this.svc.validar(key ?? '');
  }

  /** GET /api/extension/mi-licencia — para el CONTADOR logueado */
  @Get('mi-licencia')
  @UseGuards(JwtAuthGuard)
  async miLicencia(@Request() req: any) {
    const lic = await this.svc.obtenerDeUsuario(req.user.sub);
    if (!lic) return { licencia: null };
    return { licencia: { apiKey: lic.apiKey, activa: lic.activa, createdAt: lic.createdAt } };
  }

  /** GET /api/extension/licencias — superadmin: lista todas */
  @Get('licencias')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listar() {
    return this.svc.listar();
  }

  /** POST /api/extension/licencias — superadmin: crear licencia manual (N1CO u otro) */
  @Post('licencias')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async crear(@Body() body: { nombre: string; email: string; origen?: 'ifactu' | 'n1co'; expiresAt?: string }) {
    if (!body.nombre || !body.email) throw new BadRequestException('nombre y email son requeridos');
    return this.svc.crear({
      nombre:    body.nombre,
      email:     body.email,
      origen:    body.origen ?? 'n1co',
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
  }

  /** PATCH /api/extension/licencias/:id/revocar — superadmin */
  @Patch('licencias/:id/revocar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async revocar(@Param('id') id: string) {
    await this.svc.revocar(id);
    return { ok: true };
  }

  /** PATCH /api/extension/licencias/:id/reactivar — superadmin */
  @Patch('licencias/:id/reactivar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  async reactivar(@Param('id') id: string) {
    await this.svc.reactivar(id);
    return { ok: true };
  }
}
