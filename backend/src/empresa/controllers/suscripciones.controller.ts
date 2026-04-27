import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SuscripcionesService } from '../services/suscripciones.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { RolUsuario } from '../../usuarios/usuario.entity';
import { TipoSuscripcion, EstadoSuscripcion } from '../entities/suscripcion.entity';

@Controller('api/superadmin/suscripciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPERADMIN)
export class SuscripcionesController {
  constructor(private readonly suscripcionesService: SuscripcionesService) {}

  @Get()
  listar() {
    return this.suscripcionesService.listarSuscripciones();
  }

  @Post()
  crear(@Body() body: {
    empresaId: string;
    tipo: TipoSuscripcion;
    fechaInicio: Date;
    fechaVencimiento: Date;
    precioMensual?: number;
    notas?: string;
  }) {
    return this.suscripcionesService.crearSuscripcion(body.empresaId, {
      tipo: body.tipo,
      fechaInicio: body.fechaInicio,
      fechaVencimiento: body.fechaVencimiento,
      precioMensual: body.precioMensual,
      notas: body.notas,
    });
  }

  @Patch(':id/renovar')
  renovar(
    @Param('id') id: string,
    @Body() body: { nuevaFechaVencimiento: Date },
  ) {
    return this.suscripcionesService.renovarSuscripcion(id, body.nuevaFechaVencimiento);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id') id: string,
    @Body() body: { estado: EstadoSuscripcion },
  ) {
    return this.suscripcionesService.actualizarEstado(id, body.estado);
  }
}
