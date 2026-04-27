import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosRootAliasController } from './pos-root-alias.controller';
import { ApiKeyGuard } from './api-key.guard';
import { DteModule } from '../dte/dte.module';
import { EmpresaModule } from '../empresa/empresa.module';

@Module({
  imports: [DteModule, EmpresaModule],
  controllers: [PosController, PosRootAliasController],
  providers: [ApiKeyGuard],
})
export class PosModule {}
