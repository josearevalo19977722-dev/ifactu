import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dte } from '../dte/entities/dte.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { ComprasModule } from '../compras/compras.module';

@Module({
  imports: [TypeOrmModule.forFeature([Dte, Empresa]), ComprasModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
