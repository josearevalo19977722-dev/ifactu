import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { CorrelativesService } from './correlatives.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('correlativos')
@UseGuards(JwtAuthGuard)
export class CorrelativesController {
  constructor(private readonly correlativesService: CorrelativesService) {}

  @Get()
  async listar(@Request() req) {
    if (!req.user.empresa) return [];
    return this.correlativesService.listar(req.user.empresa.id);
  }

  @Post('inicializar')
  async inicializar(@Request() req, @Body() body: any) {
    // Solo permitir si el usuario tiene empresa asignada
    if (!req.user.empresa) return { error: 'No tienes empresa asignada' };
    
    return this.correlativesService.inicializar(req.user.empresa, body);
  }
}
