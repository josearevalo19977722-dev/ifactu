import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContabilidadService } from './contabilidad.service';

@Controller('contabilidad')
@UseGuards(JwtAuthGuard)
export class ContabilidadController {
  constructor(private readonly svc: ContabilidadService) {}

  /** Lista asientos del mes (paginado) */
  @Get('asientos')
  listar(
    @Query('mes')   mes:   string,
    @Query('anio')  anio:  string,
    @Query('page')  page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listar({
      mes:   Number(mes),
      anio:  Number(anio),
      page:  Number(page  || 1),
      limit: Number(limit || 50),
    });
  }

  /** Resumen / Libro Mayor del mes */
  @Get('asientos/resumen')
  resumen(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
  ) {
    return this.svc.resumenMes(Number(mes), Number(anio));
  }

  /** Genera asientos para todos los DTEs + compras de un mes */
  @Post('asientos/generar')
  generar(@Body() body: { mes: number; anio: number }) {
    return this.svc.generarLote(body.mes, body.anio);
  }

  /** Borra todos los asientos del mes (para poder regenerar corregidos) */
  @Delete('asientos/limpiar')
  limpiar(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
  ) {
    return this.svc.limpiarLote(Number(mes), Number(anio));
  }
}
