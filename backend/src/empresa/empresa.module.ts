import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { Empresa } from './entities/empresa.entity';
import { EmpresaService } from './services/empresa.service';
import { EmpresaController } from './controllers/empresa.controller';
import { Sucursal } from './entities/sucursal.entity';
import { PuntoVenta } from './entities/punto-venta.entity';
import { TenantsService } from './services/tenants.service';
import { TenantsController } from './controllers/tenants.controller';
import { Usuario } from '../usuarios/usuario.entity';
import { Suscripcion } from './entities/suscripcion.entity';
import { SuscripcionesService } from './services/suscripciones.service';
import { SuperadminController } from './controllers/superadmin.controller';
import { SuscripcionesController } from './controllers/suscripciones.controller';
import { Dte } from '../dte/entities/dte.entity';
import { Certificado } from './entities/certificado.entity';
import { CertificadosService } from './services/certificados.service';
import { CertificadosController, CertificadosEmpresaController } from './controllers/certificados.controller';
import { SucursalesService } from './services/sucursales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa, Sucursal, PuntoVenta, Usuario, Suscripcion, Dte, Certificado]),
    forwardRef(() => BillingModule),
  ],
  controllers: [EmpresaController, TenantsController, SuperadminController, SuscripcionesController, CertificadosController, CertificadosEmpresaController],
  providers: [EmpresaService, TenantsService, SuscripcionesService, CertificadosService, SucursalesService],
  exports: [EmpresaService, SuscripcionesService, CertificadosService, SucursalesService],
})
export class EmpresaModule {}
