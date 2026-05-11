import { Controller, Get, Post, Param, Body, NotFoundException, BadRequestException, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { Dte } from '../entities/dte.entity';
import { PdfService } from '../services/pdf.service';
import { NotificacionDteService } from '../services/notificacion-dte.service';

const TIPO_DTE_NOMBRES: Record<string, string> = {
  '01': 'Factura Consumidor Final',
  '03': 'Comprobante de Crédito Fiscal',
  '04': 'Nota de Remisión',
  '05': 'Nota de Crédito',
  '06': 'Nota de Débito',
  '07': 'Comprobante de Retención',
  '08': 'Comprobante de Liquidación',
  '09': 'Documento Contable de Liquidación',
  '11': 'Factura de Exportación',
  '14': 'Factura de Sujeto Excluido',
  '15': 'Comprobante de Donación',
};

@Controller('public/dte')
export class PublicDteController {
  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly pdfService: PdfService,
    private readonly notificacion: NotificacionDteService,
  ) {}

  /** GET /api/public/dte/:codigoGeneracion — no auth required */
  @Get(':codigoGeneracion')
  async obtenerDatosPublicos(@Param('codigoGeneracion') codigoGeneracion: string) {
    const dte = await this.dteRepo.findOne({
      where: { codigoGeneracion },
      relations: ['empresa'],
    });

    if (!dte) {
      throw new NotFoundException('DTE no encontrado');
    }

    const json = dte.jsonDte as any;
    const emisor = json?.emisor ?? {};
    const receptor = json?.receptor ?? {};

    return {
      codigoGeneracion: dte.codigoGeneracion,
      numeroControl: dte.numeroControl,
      tipoDte: dte.tipoDte,
      tipoNombre: TIPO_DTE_NOMBRES[dte.tipoDte] ?? 'Documento Tributario Electrónico',
      fechaEmision: dte.fechaEmision,
      estado: dte.estado,
      selloRecepcion: dte.selloRecepcion,
      totalPagar: Number(dte.totalPagar),
      emisor: {
        nombre: dte.empresa?.nombreLegal ?? emisor.nombre ?? '—',
        nit: dte.empresa?.nit ?? emisor.nit ?? '—',
        nrc: dte.empresa?.nrc ?? emisor.nrc ?? '—',
      },
      receptor: {
        nombre: receptor.nombre || dte.receptorNombre || null,
        nit: receptor.nit || receptor.numDocumento || null,
      },
    };
  }

  /** POST /api/public/dte/:codigoGeneracion/enviar-correo — envía el DTE al correo indicado */
  @Post(':codigoGeneracion/enviar-correo')
  async enviarCorreo(
    @Param('codigoGeneracion') codigoGeneracion: string,
    @Body() body: { correo?: string },
  ) {
    const correo = body.correo?.trim() ?? '';
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      throw new BadRequestException('Correo electrónico inválido');
    }

    const dte = await this.dteRepo.findOne({
      where: { codigoGeneracion },
      relations: ['empresa'],
    });
    if (!dte) throw new NotFoundException('DTE no encontrado');

    const json = dte.jsonDte as any;
    const nombre: string = json?.receptor?.nombre || dte.receptorNombre || 'Cliente';

    await this.notificacion.enviarACorreo(dte, correo, nombre);
    return { ok: true };
  }

  /** GET /api/public/dte/:id/pdf — legacy route kept for backward compat */
  @Get(':id/pdf')
  async descargarPdfPublico(@Param('id') id: string, @Res() res: Response) {
    try {
      const buffer = await this.pdfService.generarPdf(id);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=DTE-${id}.pdf`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch {
      throw new NotFoundException('PDF no encontrado');
    }
  }
}
