import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dte } from '../dte/entities/dte.entity';
import { SaludService } from './salud.service';
import { SaludController } from './salud.controller';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Dte]),
  ],
  controllers: [SaludController],
  providers: [SaludService],
})
export class SuperadminModule {}
