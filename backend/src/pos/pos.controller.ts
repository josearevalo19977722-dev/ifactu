import { Body, Controller, Post, UseGuards, Req, Param } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { CfService } from '../dte/services/cf.service';
import { CcfService } from '../dte/services/ccf.service';
import { TicketService } from '../dte/services/ticket.service';
import { CreateCfDto } from '../dte/dto/create-cf.dto';
import { CreateCcfDto } from '../dte/dto/create-ccf.dto';
import { InvalidacionService } from '../dte/services/invalidacion.service';
import { InvalidarDteDto } from '../dte/dto/invalidar-dte.dto';

/**
 * Endpoints de integración con punto de venta (POS).
 * Protegidos con API Key via cabecera X-API-Key (identifica la empresa).
 * El cuerpo puede incluir codEstable / codPuntoVenta por factura; el establecimiento debe
 * coincidir con «Identificadores fiscales» o con una sucursal registrada en Configuración.
 */
@Controller('pos')
@UseGuards(ApiKeyGuard)
export class PosController {
  constructor(
    private readonly cfService: CfService,
    private readonly ccfService: CcfService,
    private readonly ticketService: TicketService,
    private readonly invalidacionService: InvalidacionService,
  ) {}

  /**
   * POST /api/pos/cf
   * Emite una Factura Consumidor Final desde el POS.
   */
  @Post('cf')
  async emitirCf(@Body() dto: CreateCfDto, @Req() req: any) {
    const empresaId = req.empresa.id;
    const dte = await this.cfService.emitir(dto, empresaId, dto.codEstable, dto.codPuntoVenta);
    return {
      success: true,
      dte: this.ticketService.getVariablesForTicket(dte),
    };
  }

  /**
   * POST /api/pos/ccf
   * Emite un Comprobante de Crédito Fiscal desde el POS.
   */
  @Post('ccf')
  async emitirCcf(@Body() dto: CreateCcfDto, @Req() req: any) {
    const empresaId = req.empresa.id;
    const dte = await this.ccfService.emitir(dto, empresaId, dto.codEstable, dto.codPuntoVenta);
    return {
      success: true,
      dte: this.ticketService.getVariablesForTicket(dte),
    };
  }

  /**
   * POST /api/pos/dte/:id/anular
   * Anula un DTE previamente RECIBIDO usando autenticación por X-API-Key.
   */
  @Post('dte/:id/anular')
  async anularDte(
    @Param('id') id: string,
    @Body() dto: Omit<InvalidarDteDto, 'dteId'>,
    @Req() req: any,
  ) {
    const empresaId = req.empresa.id;
    const dte = await this.invalidacionService.anular({ ...dto, dteId: id }, empresaId);
    return {
      success: true,
      dte: this.ticketService.getVariablesForTicket(dte),
    };
  }
}
