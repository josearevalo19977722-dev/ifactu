import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthMhService } from './auth-mh.service';

@Module({
  imports: [HttpModule],
  providers: [AuthMhService],
  exports: [AuthMhService],
})
export class AuthMhModule {}
