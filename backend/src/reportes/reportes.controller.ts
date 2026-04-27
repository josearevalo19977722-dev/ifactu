import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportesService } from './reportes.service';

@UseGuards(JwtAuthGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  /** Vista previa JSON para el frontend */
  @Get('resumen')
  resumen(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
  ) {
    return this.reportesService.resumenMes(Number(mes), Number(anio));
  }

  /** Libro de Ventas a Consumidores (CF) → Excel */
  @Get('libro-ventas-cf')
  async libroCf(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const buf  = await this.reportesService.excelLibroVentasCf(Number(mes), Number(anio));
    const name = `LibroVentasCF-${anio}-${mes.padStart(2,'0')}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  /** Libro de Ventas a Contribuyentes (CCF/NC/ND) → Excel */
  @Get('libro-ventas-ccf')
  async libroCcf(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const buf  = await this.reportesService.excelLibroVentasCcf(Number(mes), Number(anio));
    const name = `LibroVentasCCF-${anio}-${mes.padStart(2,'0')}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  /** Anexo F-07 completo (CF + CCF + Retenciones, 4 hojas) → Excel */
  @Get('anexo-f07')
  async anexoF07(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const buf  = await this.reportesService.excelAnexoF07(Number(mes), Number(anio));
    const name = `AnexoF07-${anio}-${mes.padStart(2,'0')}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  /** Anexo 1 — Ventas a Contribuyentes (CCF/NC/ND) → CSV Hacienda F-07 */
  @Get('csv-anexo1')
  async csvAnexo1(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const csv  = await this.reportesService.csvAnexo1(Number(mes), Number(anio));
    const name = `Anexo1-VentasContribuyentes-${anio}-${mes.padStart(2,'0')}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    res.end(csv);
  }

  /** Anexo 2 — Ventas a Consumidor Final (CF) → CSV Hacienda F-07 */
  @Get('csv-anexo2')
  async csvAnexo2(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const csv  = await this.reportesService.csvAnexo2(Number(mes), Number(anio));
    const name = `Anexo2-VentasConsumidorFinal-${anio}-${mes.padStart(2,'0')}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    res.end(csv);
  }

  /** Anexo 3 — Compras → CSV Hacienda F-07 */
  @Get('csv-anexo3')
  async csvAnexo3(
    @Query('mes')  mes:  string,
    @Query('anio') anio: string,
    @Res() res: Response,
  ) {
    const csv  = await this.reportesService.csvAnexo3(Number(mes), Number(anio));
    const name = `Anexo3-Compras-${anio}-${mes.padStart(2,'0')}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    res.end(csv);
  }
}
