import { Controller, Get, Post, UseGuards, HttpCode } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { RolUsuario } from '../usuarios/usuario.entity';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPERADMIN)
export class WhatsappController {
  constructor(private readonly wa: WhatsappService) {}

  /**
   * GET /api/whatsapp/estado
   * Devuelve el estado de la conexión y el QR (si está pendiente de escanear).
   */
  @Get('estado')
  estado() {
    return {
      estado:  this.wa.getEstado(),
      numero:  this.wa.getNumero(),
      qr:      this.wa.getQr(),  // data:image/png;base64,... o null
    };
  }

  /**
   * POST /api/whatsapp/desconectar
   * Cierra la sesión de WhatsApp (útil para cambiar de número).
   */
  @Post('desconectar')
  @HttpCode(200)
  async desconectar() {
    await this.wa.desconectar();
    return { ok: true };
  }
}
