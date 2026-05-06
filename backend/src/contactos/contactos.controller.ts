import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContactosService } from './contactos.service';
import { Contacto } from './contacto.entity';

@UseGuards(JwtAuthGuard)
@Controller('contactos')
export class ContactosController {
  constructor(private readonly svc: ContactosService) {}

  @Post()
  crear(@Body() dto: Partial<Contacto>, @Request() req: any) {
    return this.svc.crear(dto, req.user.empresaId);
  }

  @Get()
  listar(
    @Request() req: any,
    @Query('tipo')  tipo?: string,
    @Query('q')     q?: string,
    @Query('page')  page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listar({ tipo, q, page: Number(page), limit: Number(limit), empresaId: req.user.empresaId });
  }

  @Get('buscar')
  buscar(@Query('q') q: string, @Request() req: any) {
    return this.svc.buscar(q, req.user.empresaId);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Request() req: any) {
    return this.svc.obtener(id, req.user.empresaId);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() dto: Partial<Contacto>, @Request() req: any) {
    return this.svc.actualizar(id, dto, req.user.empresaId);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @Request() req: any) {
    return this.svc.eliminar(id, req.user.empresaId);
  }
}
