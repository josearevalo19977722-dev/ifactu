import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { TestMhService } from './test-mh.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { RolUsuario } from '../usuarios/usuario.entity';

@Controller('admin/test-mh')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPERADMIN)
export class TestMhController {
  constructor(private readonly svc: TestMhService) {}

  @Post(':empresaId/conexion')
  probarConexion(@Param('empresaId') id: string) {
    return this.svc.probarConexion(id);
  }

  @Post(':empresaId/dte')
  probarDte(@Param('empresaId') id: string, @Body() body: { tipoDte: string; receptorOverride?: Record<string, any>; invalidar?: boolean }) {
    return this.svc.probarDte(id, body.tipoDte, body.receptorOverride, body.invalidar ?? false);
  }

  @Post(':empresaId/lote')
  async iniciarLote(
    @Param('empresaId') id: string,
    @Body() body: { tipoDte: string; cantidad: number; receptorOverride?: Record<string, any> },
  ) {
    const jobId = await this.svc.iniciarLote(id, body.tipoDte, body.cantidad, body.receptorOverride);
    return { jobId };
  }

  @Get(':empresaId/lote/:jobId')
  consultarLote(@Param('empresaId') _id: string, @Param('jobId') jobId: string) {
    const job = this.svc.consultarLote(jobId);
    if (!job) return { error: 'Job no encontrado' };
    return job;
  }

  @Post(':empresaId/invalidacion')
  probarInvalidacion(@Param('empresaId') id: string) {
    return this.svc.probarInvalidacion(id);
  }
}
