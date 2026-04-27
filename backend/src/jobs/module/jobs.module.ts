import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronService } from '../services/cron.service';
import { BillingCronService } from '../services/billing-cron.service';
import { Dte } from '../../dte/entities/dte.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { Suscripcion } from '../../empresa/entities/suscripcion.entity';
import { DteModule } from '../../dte/dte.module';
import { EmpresaModule } from '../../empresa/empresa.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dte, Empresa, Suscripcion]),
    DteModule,
    EmpresaModule,
  ],
  providers: [
    CronService,
    BillingCronService,
  ],
})
export class JobsModule {}
