import {
  Controller,
  Get,
  Patch,
  Body,
  UseInterceptors,
  UploadedFile,
  Post,
  UseGuards,
  BadRequestException,
  Req,
  Delete,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import 'multer';
import { extname, join } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { EmpresaService } from '../services/empresa.service';
import { SucursalesService } from '../services/sucursales.service';
import { CreateSucursalDto, UpdateSucursalDto } from '../dto/sucursal.dto';
import { CreatePuntoVentaDto, UpdatePuntoVentaDto } from '../dto/punto-venta.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { RolUsuario } from '../../usuarios/usuario.entity';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Controller('empresa')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmpresaController {
  constructor(
    private readonly empresaService: EmpresaService,
    private readonly sucursalesService: SucursalesService,
  ) {}

  @Get()
  async obtener(@Req() req: { user: { empresaId?: string | null } }) {
    return this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
  }

  @Patch()
  @Roles(RolUsuario.ADMIN)
  async actualizar(@Body() dto: any, @Req() req: { user: { empresaId?: string | null } }) {
    return this.empresaService.actualizar(dto, req.user?.empresaId ?? undefined);
  }

  @Post('logo')
  @Roles(RolUsuario.ADMIN)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './uploads/logo',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `logo-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(new BadRequestException('Solo se permiten imágenes (JPG, PNG)'), false);
        }
        cb(null, true);
      },
    }),
  )
  async cargarLogo(
    @UploadedFile() file: MulterFile,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    if (!file) {
      throw new BadRequestException('Por favor cargue una imagen válida.');
    }
    const path = `uploads/logo/${file.filename}`;
    return this.empresaService.guardarLogo(path, req.user?.empresaId ?? undefined);
  }

  @Post('certificado')
  @Roles(RolUsuario.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/certs',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `cert-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(p12|pfx|crt|key)$/)) {
          return cb(new BadRequestException('Solo se permiten archivos de certificado (.p12, .pfx)'), false);
        }
        cb(null, true);
      },
    }),
  )
  async cargarCertificado(
    @UploadedFile() file: MulterFile,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    if (!file) throw new BadRequestException('Archivo no subido');

    // Copiar al directorio del firmador Docker como {NIT}.crt
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    const nit = empresa.nit.replace(/-/g, '');
    const firmadorDir = join(process.cwd(), 'certificados');
    if (!existsSync(firmadorDir)) mkdirSync(firmadorDir, { recursive: true });
    copyFileSync(file.path, join(firmadorDir, `${nit}.crt`));

    const filePath = `uploads/certs/${file.filename}`;
    return this.empresaService.actualizar({ mhCertificadoPath: filePath }, req.user?.empresaId ?? undefined);
  }

  @Post('nexa-key')
  @Roles(RolUsuario.ADMIN)
  async generarNexaKey(@Req() req: { user: { empresaId?: string | null } }) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    const key = await this.empresaService.generarInternalApiKey(empresa.id);
    return { internalApiKey: key };
  }

  /** Catálogo de sucursales / establecimientos MH (solo administrador de empresa) */
  @Get('sucursales')
  @Roles(RolUsuario.ADMIN)
  async listarSucursales(@Req() req: { user: { empresaId?: string | null } }) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    return this.sucursalesService.findAll(empresa.id);
  }

  @Post('sucursales')
  @Roles(RolUsuario.ADMIN)
  async crearSucursal(
    @Body() dto: CreateSucursalDto,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    return this.sucursalesService.create(empresa.id, dto);
  }

  @Patch('sucursales/:id')
  @Roles(RolUsuario.ADMIN)
  async actualizarSucursal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSucursalDto,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    return this.sucursalesService.update(id, empresa.id, dto);
  }

  @Delete('sucursales/:id')
  @Roles(RolUsuario.ADMIN)
  async eliminarSucursal(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    await this.sucursalesService.remove(id, empresa.id);
    return { ok: true };
  }

  @Get('sucursales/:sucursalId/puntos-venta')
  @Roles(RolUsuario.ADMIN)
  async listarPuntosVenta(
    @Param('sucursalId', ParseUUIDPipe) sucursalId: string,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    return this.sucursalesService.listPuntosVenta(sucursalId, empresa.id);
  }

  @Post('sucursales/:sucursalId/puntos-venta')
  @Roles(RolUsuario.ADMIN)
  async crearPuntoVenta(
    @Param('sucursalId', ParseUUIDPipe) sucursalId: string,
    @Body() dto: CreatePuntoVentaDto,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    return this.sucursalesService.createPuntoVenta(empresa.id, sucursalId, dto);
  }

  @Patch('puntos-venta/:id')
  @Roles(RolUsuario.ADMIN)
  async actualizarPuntoVenta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePuntoVentaDto,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    return this.sucursalesService.updatePuntoVenta(empresa.id, id, dto);
  }

  @Delete('puntos-venta/:id')
  @Roles(RolUsuario.ADMIN)
  async eliminarPuntoVenta(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { empresaId?: string | null } },
  ) {
    const empresa = await this.empresaService.obtenerPerfil(req.user?.empresaId ?? undefined);
    await this.sucursalesService.removePuntoVenta(empresa.id, id);
    return { ok: true };
  }
}
