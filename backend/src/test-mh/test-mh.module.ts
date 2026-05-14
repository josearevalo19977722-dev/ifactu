import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestMhService } from './test-mh.service';
import { TestMhController } from './test-mh.controller';
import { Empresa } from '../empresa/entities/empresa.entity';
import { Dte } from '../dte/entities/dte.entity';
import { AuthMhModule } from '../auth-mh/auth-mh.module';
import { DteModule } from '../dte/dte.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa, Dte]),
    AuthMhModule,
    forwardRef(() => DteModule),
  ],
  controllers: [TestMhController],
  providers: [TestMhService],
})
export class TestMhModule {}
