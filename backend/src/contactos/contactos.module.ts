import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contacto } from './contacto.entity';
import { Empresa } from '../empresa/entities/empresa.entity';
import { ContactosService } from './contactos.service';
import { ContactosController } from './contactos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contacto, Empresa])],
  controllers: [ContactosController],
  providers: [ContactosService],
  exports: [ContactosService],
})
export class ContactosModule {}
