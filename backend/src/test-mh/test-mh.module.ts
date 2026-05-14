import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TestMhService } from './test-mh.service';
import { TestMhController } from './test-mh.controller';
import { Empresa } from '../empresa/entities/empresa.entity';
import { AuthMhModule } from '../auth-mh/auth-mh.module';
import { SignerService } from '../dte/services/signer.service';
import { TransmitterService } from '../dte/services/transmitter.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa]),
    HttpModule,
    AuthMhModule,
  ],
  controllers: [TestMhController],
  providers: [TestMhService, SignerService, TransmitterService],
})
export class TestMhModule {}
