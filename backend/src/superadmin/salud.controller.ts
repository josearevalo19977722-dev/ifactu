import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { RolUsuario } from '../usuarios/usuario.entity';
import { SaludService } from './salud.service';

@Controller('superadmin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPERADMIN)
export class SaludController {
  constructor(private readonly salud: SaludService) {}

  @Get('salud')
  verificar() {
    return this.salud.verificar();
  }
}
