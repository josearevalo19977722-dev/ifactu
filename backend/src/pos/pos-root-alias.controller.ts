import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { CfService } from '../dte/services/cf.service';
import { CcfService } from '../dte/services/ccf.service';
import { TicketService } from '../dte/services/ticket.service';
import { CreateCfDto } from '../dte/dto/create-cf.dto';
import { CreateCcfDto } from '../dte/dto/create-ccf.dto';

/**
 * Alias en la raíz del prefijo /api para clientes que llaman POST /api/cf (p. ej. Nexa).
 * La ruta canónica sigue siendo POST /api/pos/cf.
 */
@Controller()
@UseGuards(ApiKeyGuard)
export class PosRootAliasController {
  constructor(
    private readonly cfService: CfService,
    private readonly ccfService: CcfService,
    private readonly ticketService: TicketService,
  ) {}

  @Post('cf')
  async emitirCf(@Body() dto: CreateCfDto, @Req() req: { empresa: { id: string } }) {
    const empresaId = req.empresa.id;
    const dte = await this.cfService.emitir(dto, empresaId, dto.codEstable, dto.codPuntoVenta);
    return {
      success: true,
      dte: this.ticketService.getVariablesForTicket(dte),
    };
  }

  @Post('ccf')
  async emitirCcf(@Body() dto: CreateCcfDto, @Req() req: { empresa: { id: string } }) {
    const empresaId = req.empresa.id;
    const dte = await this.ccfService.emitir(dto, empresaId, dto.codEstable, dto.codPuntoVenta);
    return {
      success: true,
      dte: this.ticketService.getVariablesForTicket(dte),
    };
  }
}
