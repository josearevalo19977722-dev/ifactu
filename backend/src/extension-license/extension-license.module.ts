import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtensionLicense } from './extension-license.entity';
import { LicenseDevice } from './license-device.entity';
import { ExtensionPlanConfig } from './extension-plan-config.entity';
import { ExtensionPago } from './extension-pago.entity';
import { ExtensionLicenseService } from './extension-license.service';
import { ExtensionLicenseController } from './extension-license.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExtensionLicense, LicenseDevice, ExtensionPlanConfig, ExtensionPago]),
  ],
  controllers: [ExtensionLicenseController],
  providers: [ExtensionLicenseService],
  exports: [ExtensionLicenseService],
})
export class ExtensionLicenseModule {}
