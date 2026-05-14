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
  probarDte(@Param('empresaId') id: string, @Body() body: { tipoDte: string }) {
    return this.svc.probarDte(id, body.tipoDte);
  }

  @Post(':empresaId/lote')
  async iniciarLote(
    @Param('empresaId') id: string,
    @Body() body: { tipoDte: string; cantidad: number },
  ) {
    const jobId = await this.svc.iniciarLote(id, body.tipoDte, body.cantidad);
    return { jobId };
  }

  @Get(':empresaId/lote/:jobId')
  consultarLote(@Param('empresaId') _id: string, @Param('jobId') jobId: string) {
    const job = this.svc.consultarLote(jobId);
    if (!job) return { error: 'Job no encontrado' };
    return job;
  }
}
