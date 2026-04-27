import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventarioService } from './inventario.service';
import { Producto } from './producto.entity';

@UseGuards(JwtAuthGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly svc: InventarioService) {}

  // ── Productos ─────────────────────────────────────────────────────────────

  @Post('productos')
  crear(@Body() dto: Partial<Producto>) { return this.svc.crearProducto(dto); }

  @Get('productos')
  listar(
    @Query('q')         q?: string,
    @Query('page')      page = '1',
    @Query('limit')     limit = '30',
    @Query('bajoStock') bajoStock?: string,
  ) {
    return this.svc.listar({
      q,
      page: Number(page),
      limit: Number(limit),
      bajoStock: bajoStock === 'true',
    });
  }

  @Get('productos/:id')
  obtener(@Param('id') id: string) { return this.svc.obtener(id); }

  @Patch('productos/:id')
  actualizar(@Param('id') id: string, @Body() dto: Partial<Producto>) {
    return this.svc.actualizar(id, dto);
  }

  @Delete('productos/:id')
  desactivar(@Param('id') id: string) { return this.svc.desactivar(id); }

  // ── Movimientos ────────────────────────────────────────────────────────────

  @Get('productos/:id/movimientos')
  movimientos(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.svc.movimientosProducto(id, Number(page), Number(limit));
  }

  @Post('entrada')
  entrada(@Body() body: {
    productoId: string; cantidad: number; costoUnitario: number;
    fecha?: string; descripcion?: string;
  }) {
    return this.svc.registrarEntrada(body);
  }

  @Post('salida')
  salida(@Body() body: {
    productoId: string; cantidad: number; costoUnitario?: number;
    fecha?: string; descripcion?: string;
  }) {
    return this.svc.registrarSalida(body);
  }

  @Post('ajuste')
  ajuste(@Body() body: { productoId: string; stockNuevo: number; descripcion?: string }) {
    return this.svc.ajuste(body);
  }
}
