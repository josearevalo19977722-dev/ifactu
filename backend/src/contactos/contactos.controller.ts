import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ContactosService } from './contactos.service';
import { Contacto } from './contacto.entity';

@Controller('contactos')
export class ContactosController {
  constructor(private readonly svc: ContactosService) {}

  @Post()
  crear(@Body() dto: Partial<Contacto>) { return this.svc.crear(dto); }

  @Get()
  listar(
    @Query('tipo')  tipo?: string,
    @Query('q')     q?: string,
    @Query('page')  page = '1',
    @Query('limit') limit = '20',
  ) { return this.svc.listar({ tipo, q, page: Number(page), limit: Number(limit) }); }

  @Get('buscar')
  buscar(@Query('q') q: string) { return this.svc.buscar(q); }

  @Get(':id')
  obtener(@Param('id') id: string) { return this.svc.obtener(id); }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() dto: Partial<Contacto>) {
    return this.svc.actualizar(id, dto);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string) { return this.svc.eliminar(id); }
}
