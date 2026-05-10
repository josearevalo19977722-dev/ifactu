import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { CorrelativesService } from './correlatives.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('correlativos')
@UseGuards(JwtAuthGuard)
export class CorrelativesController {
  constructor(private readonly correlativesService: CorrelativesService) {}

  @Get()
  async listar(@Request() req) {
    if (!req.user.empresaId) return [];
    return this.correlativesService.listar(req.user.empresaId);
  }

  @Post('inicializar')
  async inicializar(@Request() req, @Body() body: any) {
    if (!req.user.empresaId) return { error: 'No tienes empresa asignada' };
    return this.correlativesService.inicializar(req.user.empresaId, body);
  }
}
