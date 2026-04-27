import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { InvalidacionService } from '../services/invalidacion.service';
import { InvalidarDteDto } from '../dto/invalidar-dte.dto';

@UseGuards(JwtAuthGuard)
@Controller('dte/invalidar')
export class InvalidacionController {
  constructor(private readonly service: InvalidacionService) {}

  @Post()
  async anular(@Body() dto: InvalidarDteDto, @Request() req: any) {
    const empresaId = req.user.empresaId;
    return this.service.anular(dto, empresaId);
  }
}
