import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ComprasService } from './compras.service';
import { Compra } from './compra.entity';
import * as ExcelJS from 'exceljs';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

@UseGuards(JwtAuthGuard)
@Controller('compras')
export class ComprasController {
  constructor(private readonly svc: ComprasService) {}

  @Post()
  registrar(@Body() dto: Partial<Compra>, @Req() req: Request) {
    return this.svc.registrar({ ...dto, empresaId: (req.user as any).empresaId });
  }

  /** Recibe un JSON DTE y devuelve la compra + ítems pre-llenados sin guardar */
  @Post('parsear-json')
  parsearJson(@Body() body: { json: any }) {
    return this.svc.parsearJson(body.json);
  }

  /** Recibe un JSON DTE, lo parsea, guarda y opcionalmente aplica al inventario */
  @Post('desde-json')
  registrarDesdeJson(@Body() body: { json: any; aplicarInventario?: boolean }, @Req() req: Request) {
    return this.svc.registrarDesdeJson(body.json, {
      aplicarInventario: body.aplicarInventario !== false,
      empresaId: (req.user as any).empresaId,
    });
  }

  @Get()
  listar(
    @Query('mes')   mes?: string,
    @Query('anio')  anio?: string,
    @Query('q')     q?: string,
    @Query('page')  page = '1',
    @Query('limit') limit = '20',
    @Req() req?: Request,
  ) {
    return this.svc.listar({
      mes: mes ? Number(mes) : undefined,
      anio: anio ? Number(anio) : undefined,
      q, page: Number(page), limit: Number(limit),
      empresaId: (req!.user as any).empresaId,
    });
  }

  @Get('resumen')
  resumen(@Query('mes') mes: string, @Query('anio') anio: string, @Req() req: Request) {
    return this.svc.resumenMes(Number(mes), Number(anio), (req.user as any).empresaId);
  }

  @Get('excel')
  async excel(
    @Query('mes') mes: string, @Query('anio') anio: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const mesN = Number(mes); const anioN = Number(anio);
    const [compras] = await this.svc.listar({ mes: mesN, anio: anioN, limit: 9999, empresaId: (req.user as any).empresaId });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Libro de Compras');

    // Título
    ws.mergeCells(1, 1, 1, 9);
    ws.getRow(1).getCell(1).value = `LIBRO DE COMPRAS — ${MESES[mesN-1].toUpperCase()} ${anioN}`;
    ws.getRow(1).getCell(1).font = { bold: true, size: 13, color: { argb: 'FF1a56db' } };
    ws.getRow(1).getCell(1).alignment = { horizontal: 'center' };
    ws.getRow(1).height = 26;

    ws.columns = [
      {key:'num',width:5},{key:'fecha',width:12},{key:'tipo',width:8},
      {key:'control',width:32},{key:'nit',width:18},{key:'nombre',width:30},
      {key:'exenta',width:13},{key:'gravada',width:13},{key:'iva',width:12},{key:'total',width:13},
    ];

    ws.addRow([]);
    const hdr = ws.addRow(['#','Fecha','Tipo','N° Control','NIT Proveedor','Proveedor',
      'Compra Exenta','Compra Gravada','IVA Crédito','Total']);
    hdr.eachCell(cell => {
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1a56db' } };
      cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10 };
      cell.alignment = { horizontal:'center' };
    });
    hdr.height = 22;

    let tEx=0, tGr=0, tIva=0, tTot=0;
    const TIPOS: Record<string,string> = {'01':'CF','03':'CCF','11':'FEXE','14':'FSE'};

    compras.forEach((c, i) => {
      tEx  += Number(c.compraExenta);
      tGr  += Number(c.compraGravada);
      tIva += Number(c.ivaCredito);
      tTot += Number(c.totalCompra);
      const row = ws.addRow([
        i+1, c.fechaEmision, TIPOS[c.tipoDte]??c.tipoDte,
        c.numeroControl??'', c.proveedorNit??'', c.proveedorNombre,
        Number(c.compraExenta)||null, Number(c.compraGravada)||null,
        Number(c.ivaCredito)||null, Number(c.totalCompra),
      ]);
      row.eachCell({includeEmpty:true}, cell => {
        cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb: i%2===1?'FFF8FAFC':'FFFFFFFF'}};
        cell.font = { size:9 };
      });
      [7,8,9,10].forEach(col => {
        const cell = row.getCell(col);
        if (cell.value) cell.numFmt = '"$"#,##0.00';
      });
    });

    const tot = ws.addRow(['','','','','','TOTALES', tEx||null, tGr||null, tIva||null, tTot]);
    tot.eachCell({includeEmpty:true}, cell => {
      cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFDBEAFE'}};
      cell.font = { bold:true, size:10 };
    });
    [7,8,9,10].forEach(c => { tot.getCell(c).numFmt = '"$"#,##0.00'; });

    const buf = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="LibroCompras-${anioN}-${mes.padStart(2,'0')}.xlsx"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  @Get(':id')
  obtener(@Param('id') id: string) { return this.svc.obtener(id); }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() dto: Partial<Compra>) {
    return this.svc.actualizar(id, dto);
  }

  @Patch(':id/anular')
  anular(@Param('id') id: string) { return this.svc.anular(id); }
}
