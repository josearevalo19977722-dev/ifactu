import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard, Roles } from './roles.guard';
import { RolUsuario } from '../usuarios/usuario.entity';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  /**
   * SOLO DESARROLLO — crea o resetea el superadmin maestro.
   * POST /api/auth/init-superadmin
   * Credenciales: superadmin@nexa.com / SuperAdmin1234
   */
  @Post('init-superadmin')
  async initSuperAdmin() {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('No disponible en producción');
    }
    await this.authService.initAdmin();
    return { ok: true, email: 'superadmin@nexa.com', password: 'SuperAdmin1234' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: any) {
    return req.user;
  }

  @Get('usuarios')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  listar() {
    return this.authService.listarUsuarios();
  }

  @Post('usuarios')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  crear(@Body() body: { email: string; nombre: string; password: string; rol?: RolUsuario }) {
    return this.authService.crearUsuario(body);
  }

  @Patch('usuarios/:id/rol')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  cambiarRol(@Param('id') id: string, @Body() body: { rol: RolUsuario }) {
    return this.authService.cambiarRol(id, body.rol);
  }

  @Patch('usuarios/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  toggle(@Param('id') id: string) {
    return this.authService.toggleActivo(id);
  }

  @Patch('usuarios/:id/password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  establecerPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    return this.authService.establecerPasswordUsuario(id, body.password);
  }

  // ── Endpoints exclusivos SUPERADMIN ──────────────────────────────────────

  /** Lista TODOS los usuarios del sistema (todas las empresas) */
  @Get('superadmin/usuarios')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  listarTodos() {
    return this.authService.listarTodosLosUsuarios();
  }

  /** Actualiza nombre, correo y/o contraseña de cualquier usuario */
  @Patch('superadmin/usuarios/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  actualizarUsuario(
    @Param('id') id: string,
    @Body() body: { nombre?: string; email?: string; password?: string },
  ) {
    return this.authService.actualizarUsuario(id, body);
  }

  /** Genera token de impersonación para entrar como admin de una empresa */
  @Post('superadmin/impersonar/:empresaId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.SUPERADMIN)
  impersonar(@Param('empresaId') empresaId: string, @Request() req: any) {
    return this.authService.impersonarEmpresa(empresaId, req.user.id);
  }
}
