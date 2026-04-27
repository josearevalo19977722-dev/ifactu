import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Correlative } from './entities/correlative.entity';
import { CorrelativesService } from './correlatives.service';
import { CorrelativesController } from './correlatives.controller';
import { EmpresaModule } from '../empresa/empresa.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Correlative]),
    ConfigModule,
    EmpresaModule,
  ],
  controllers: [CorrelativesController],
  providers: [CorrelativesService],
  exports: [CorrelativesService],
})
export class CorrelativesModule {}
