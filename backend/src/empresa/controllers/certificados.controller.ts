import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CertificadosService } from '../services/certificados.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { RolUsuario } from '../../usuarios/usuario.entity';
import { TipoCertificado } from '../entities/certificado.entity';

@Controller('api/superadmin/certificados')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPERADMIN)
export class CertificadosController {
  constructor(private readonly certService: CertificadosService) {}

  @Get()
  listarTodos() {
    return this.certService.listarTodos();
  }

  @Get('por-vencer')
  porVencer(@Query('dias') dias?: string) {
    return this.certService.obtenerCertificadosPorVencer(dias ? parseInt(dias) : 30);
  }

  @Get('vencidos')
  vencidos() {
    return this.certService.obtenerVencidos();
  }

  @Post('upload/:empresaId')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('empresaId') empresaId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { tipo?: TipoCertificado; fechaVencimiento?: string; serial?: string; subject?: string; issuer?: string },
  ) {
    return this.certService.uploadCertificado(empresaId, file, body.tipo, {
      fechaVencimiento: body.fechaVencimiento ? new Date(body.fechaVencimiento) : undefined,
      serial: body.serial,
      subject: body.subject,
      issuer: body.issuer,
    });
  }

  @Patch(':id/principal')
  marcarPrincipal(@Param('id') id: string, @Body() body: { empresaId: string }) {
    return this.certService.marcarPrincipal(id, body.empresaId);
  }

  @Patch(':id/desactivar')
  desactivar(@Param('id') id: string, @Body() body: { empresaId: string }) {
    return this.certService.desactivar(id, body.empresaId);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() body: { empresaId: string; fechaVencimiento?: string; notas?: string },
  ) {
    return this.certService.actualizar(id, body.empresaId, {
      fechaVencimiento: body.fechaVencimiento ? new Date(body.fechaVencimiento) : undefined,
      notas: body.notas,
    });
  }
}

@Controller('api/certificados')
@UseGuards(JwtAuthGuard)
export class CertificadosEmpresaController {
  constructor(private readonly certService: CertificadosService) {}

  @Get()
  listar(@Body('empresaId') empresaId: string) {
    return this.certService.listarPorEmpresa(empresaId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { empresaId: string; tipo?: TipoCertificado },
  ) {
    return this.certService.uploadCertificado(body.empresaId, file, body.tipo);
  }

  @Patch(':id/principal')
  marcarPrincipal(@Param('id') id: string, @Body() body: { empresaId: string }) {
    return this.certService.marcarPrincipal(id, body.empresaId);
  }

  @Get('activo')
  activo(@Body('empresaId') empresaId: string) {
    return this.certService.getCertificadoActivo(empresaId);
  }
}
