import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtensionLicense } from './extension-license.entity';
import { ExtensionLicenseService } from './extension-license.service';
import { ExtensionLicenseController } from './extension-license.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExtensionLicense])],
  controllers: [ExtensionLicenseController],
  providers: [ExtensionLicenseService],
  exports: [ExtensionLicenseService],
})
export class ExtensionLicenseModule {}
