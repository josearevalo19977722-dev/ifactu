import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { DteModule } from './dte/dte.module';
import { CorrelativesModule } from './correlatives/correlatives.module';
import { AuthMhModule } from './auth-mh/auth-mh.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PosModule } from './pos/pos.module';
import { ReportesModule } from './reportes/reportes.module';
import { AuthModule } from './auth/auth.module';
import { ContactosModule } from './contactos/contactos.module';
import { ComprasModule } from './compras/compras.module';
import { InventarioModule } from './inventario/inventario.module';
import { EmpresaModule } from './empresa/empresa.module';
import { JobsModule } from './jobs/module/jobs.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { BillingModule } from './billing/billing.module';
import { ContabilidadModule } from './contabilidad/contabilidad.module';
import { ExtensionLicenseModule } from './extension-license/extension-license.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { Usuario } from './usuarios/usuario.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    TypeOrmModule.forFeature([Usuario]),
    NotificationsModule,
    CorrelativesModule,
    AuthMhModule,
    DteModule,
    PosModule,
    ReportesModule,
    AuthModule,
    ContactosModule,
    ComprasModule,
    InventarioModule,
    EmpresaModule,
    JobsModule,
    SuperadminModule,
    BillingModule,
    ContabilidadModule,
    ExtensionLicenseModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
