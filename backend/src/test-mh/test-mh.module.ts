import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestMhService } from './test-mh.service';
import { TestMhController } from './test-mh.controller';
import { Empresa } from '../empresa/entities/empresa.entity';
import { AuthMhModule } from '../auth-mh/auth-mh.module';
import { DteModule } from '../dte/dte.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa]),
    AuthMhModule,
    forwardRef(() => DteModule),
  ],
  controllers: [TestMhController],
  providers: [TestMhService],
})
export class TestMhModule {}
