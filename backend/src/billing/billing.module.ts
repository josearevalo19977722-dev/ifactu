import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingGuardService } from './billing-guard.service';
import { N1coService } from './n1co.service';
import { PaquetesExtrasService } from './paquetes-extras.service';
import { PagoN1co } from './entities/pago-n1co.entity';
import { PlanConfig } from './entities/plan-config.entity';
import { PaqueteExtraDte } from './entities/paquete-extra-dte.entity';
import { PaqueteCatalogo } from './entities/paquete-catalogo.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { Suscripcion } from '../empresa/entities/suscripcion.entity';
import { EmpresaModule } from '../empresa/empresa.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PagoN1co, PlanConfig, PaqueteExtraDte, PaqueteCatalogo, Empresa, Suscripcion]),
    HttpModule,
    forwardRef(() => EmpresaModule),
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingGuardService, N1coService, PaquetesExtrasService],
  exports: [BillingService, BillingGuardService, N1coService, PaquetesExtrasService],
})
export class BillingModule {}
