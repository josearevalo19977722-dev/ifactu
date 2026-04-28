import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsientoContable } from './asiento.entity';
import { Dte } from '../dte/entities/dte.entity';
import { ComprasModule } from '../compras/compras.module';
import { ContabilidadService } from './contabilidad.service';
import { ContabilidadController } from './contabilidad.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AsientoContable, Dte]),
    ComprasModule,
  ],
  controllers: [ContabilidadController],
  providers:   [ContabilidadService],
  exports:     [ContabilidadService],
})
export class ContabilidadModule {}
