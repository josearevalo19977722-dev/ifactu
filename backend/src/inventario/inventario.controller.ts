import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventarioService } from './inventario.service';
import { Producto } from './producto.entity';

@UseGuards(JwtAuthGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly svc: InventarioService) {}

  // ── Productos ─────────────────────────────────────────────────────────────

  @Post('productos')
  crear(@Body() dto: Partial<Producto>, @Req() req: Request) {
    const empresaId = (req.user as any).empresaId;
    return this.svc.crearProducto(dto, empresaId);
  }

  @Get('productos')
  listar(
    @Req() req: Request,
    @Query('q')         q?: string,
    @Query('page')      page = '1',
    @Query('limit')     limit = '30',
    @Query('bajoStock') bajoStock?: string,
  ) {
    const empresaId = (req.user as any).empresaId;
    return this.svc.listar({
      q,
      page: Number(page),
      limit: Number(limit),
      bajoStock: bajoStock === 'true',
      empresaId,
    });
  }

  @Get('productos/:id')
  obtener(@Param('id') id: string, @Req() req: Request) {
    const empresaId = (req.user as any).empresaId;
    return this.svc.obtener(id, empresaId);
  }

  @Patch('productos/:id')
  actualizar(@Param('id') id: string, @Body() dto: Partial<Producto>, @Req() req: Request) {
    const empresaId = (req.user as any).empresaId;
    return this.svc.actualizar(id, dto, empresaId);
  }

  @Delete('productos/:id')
  desactivar(@Param('id') id: string, @Req() req: Request) {
    const empresaId = (req.user as any).empresaId;
    return this.svc.desactivar(id, empresaId);
  }

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
  entrada(
    @Body() body: { productoId: string; cantidad: number; costoUnitario: number; fecha?: string; descripcion?: string },
    @Req() req: Request,
  ) {
    const empresaId = (req.user as any).empresaId;
    // Verificar que el producto pertenece al tenant antes de registrar la entrada
    return this.svc.obtener(body.productoId, empresaId).then(() => this.svc.registrarEntrada(body));
  }

  @Post('salida')
  salida(
    @Body() body: { productoId: string; cantidad: number; costoUnitario?: number; fecha?: string; descripcion?: string },
    @Req() req: Request,
  ) {
    const empresaId = (req.user as any).empresaId;
    return this.svc.obtener(body.productoId, empresaId).then(() => this.svc.registrarSalida(body));
  }

  @Post('ajuste')
  ajuste(
    @Body() body: { productoId: string; stockNuevo: number; descripcion?: string },
    @Req() req: Request,
  ) {
    const empresaId = (req.user as any).empresaId;
    return this.svc.ajuste({ ...body, empresaId });
  }
}
