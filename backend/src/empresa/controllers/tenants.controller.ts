import { Controller, Get, Post, Body, UseGuards, Param, Patch, Put } from '@nestjs/common';
import { TenantsService } from '../services/tenants.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { RolUsuario } from '../../usuarios/usuario.entity';

@Controller('admin/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPERADMIN)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async list() {
    return this.tenantsService.listTenants();
  }

  @Post()
  async create(@Body() dto: any) {
    return this.tenantsService.createTenant(dto);
  }

  @Patch(':id/status')
  async toggleStatus(@Param('id') id: string) {
    return this.tenantsService.toggleTenantStatus(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.tenantsService.updateTenant(id, dto);
  }

  @Get(':id/stats')
  async stats(@Param('id') id: string) {
    return this.tenantsService.getTenantStats(id);
  }
}
