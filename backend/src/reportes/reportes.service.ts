import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dte } from '../dte/entities/dte.entity';
import { ComprasService } from '../compras/compras.service';
import * as ExcelJS from 'exceljs';

// ─── helpers CSV F-07 ────────────────────────────────────────────────────────

/** YYYY-MM-DD → DD/MM/AAAA */
function fmtFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

/** Número con 2 decimales, sin miles */
function fmtN(v: any): string {
  return Number(v || 0).toFixed(2);
}

/** Elimina guiones y espacios (NIT, UUID, numeroControl) */
function limpia(v: string | null | undefined): string {
  return (v ?? '').replace(/[-\s]/g, '');
}

/** Construye una línea CSV escapando comas/comillas */
function csvLn(fields: (string | number | null | undefined)[]): string {
  return fields.map(f => {
    const s = String(f ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── helpers ────────────────────────────────────────────────────────────────

function n(v: any): number { return Math.round((Number(v) || 0) * 100) / 100; }

function resumen(dte: Dte) {
  const json = dte.jsonDte as any;
  const r    = json?.resumen ?? {};
  return {
    totalExenta:   n(r.totalExenta   ?? r.totalCompraExenta   ?? 0),
    totalNoSuj:    n(r.totalNoSuj    ?? r.totalCompraNoSujeta ?? 0),
    totalGravada:  n(r.totalGravada  ?? r.totalCompraAfecta   ?? r.subTotalVentas ?? 0),
    totalIva:      n(r.totalIva      ?? r.ivaPerci1           ?? 0),
    totalDescu:    n(r.totalDescu    ?? r.totalDescu          ?? 0),
    totalPagar:    n(r.totalPagar    ?? dte.totalPagar        ?? 0),
  };
}

function receptor(dte: Dte) {
  const json = dte.jsonDte as any;
  return json?.receptor ?? json?.sujetoExcluido ?? json?.donatario ?? {};
}

// ─── estilos Excel ──────────────────────────────────────────────────────────

function headerStyle(ws: ExcelJS.Worksheet, row: ExcelJS.Row, color = '1a56db') {
  row.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFcccccc' } } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  row.height = 22;
}

function dataRow(row: ExcelJS.Row, shade: boolean) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade ? 'FFF8FAFC' : 'FFFFFFFF' } };
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
    cell.font = { size: 9 };
  });
  row.height = 16;
}

function totalsRow(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    cell.font = { bold: true, size: 10 };
    cell.border = { top: { style: 'medium', color: { argb: 'FF1a56db' } } };
  });
  row.height = 18;
}

function titulo(ws: ExcelJS.Worksheet, text: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getRow(1);
  t.getCell(1).value = text;
  t.getCell(1).font  = { bold: true, size: 13, color: { argb: 'FF1a56db' } };
  t.getCell(1).alignment = { horizontal: 'center' };
  t.height = 26;

  ws.mergeCells(2, 1, 2, cols);
  const sub = ws.getRow(2);
  sub.getCell(1).value = new Date().toLocaleString('es-SV');
  sub.getCell(1).font  = { size: 9, color: { argb: 'FF64748b' } };
  sub.getCell(1).alignment = { horizontal: 'center' };
}

// ─── Libro de Ventas a Consumidores (CF tipo 01) ────────────────────────────

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    private readonly comprasService: ComprasService,
  ) {}

  // Obtener DTEs de un mes/año para un tipo dado, filtrados por empresa y ambiente producción
  private async getDtesMes(tipos: string[], mes: number, anio: number, empresaId: string): Promise<Dte[]> {
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hasta = new Date(anio, mes, 0); // último día del mes
    const hastaStr = `${anio}-${String(mes).padStart(2,'0')}-${String(hasta.getDate()).padStart(2,'0')}`;

    return this.dteRepo
      .createQueryBuilder('dte')
      .where('dte.tipoDte IN (:...tipos)', { tipos })
      .andWhere('dte.fechaEmision >= :desde', { desde })
      .andWhere('dte.fechaEmision <= :hasta', { hasta: hastaStr })
      .andWhere("dte.estado != 'ANULADO'")
      .andWhere('dte.empresaId = :empresaId', { empresaId })
      .andWhere("dte.ambiente = '02'")
      .orderBy('dte.fechaEmision', 'ASC')
      .addOrderBy('dte.numeroControl', 'ASC')
      .getMany();
  }

  // ── Resumen JSON (para vista previa en frontend) ─────────────────────────

  // ── Pago a Cuenta (F-14) — 1.75 % sobre ingresos brutos ─────────────────

  async pagoACuenta(mes: number, anio: number, empresaId: string) {
    const tipos = ['01','03','05','06','07','11','14','15'];
    const dtes  = await this.getDtesMes(tipos, mes, anio, empresaId);

    const porTipo: Record<string, { nombre: string; cantidad: number; total: number }> = {};
    const NOMBRES: Record<string, string> = {
      '01': 'Factura CF',
      '03': 'Crédito Fiscal',
      '05': 'Nota de Crédito',
      '06': 'Nota de Débito',
      '07': 'Retención',
      '11': 'F. Exportación',
      '14': 'Sujeto Excluido',
      '15': 'Donación',
    };

    let ingresosBrutos = 0;
    for (const dte of dtes) {
      const t = dte.tipoDte;
      if (!porTipo[t]) porTipo[t] = { nombre: NOMBRES[t] ?? `Tipo ${t}`, cantidad: 0, total: 0 };
      const monto = n(dte.totalPagar);
      // NC reduce ingresos
      const factor = t === '05' ? -1 : 1;
      porTipo[t].cantidad += 1;
      porTipo[t].total     = n(porTipo[t].total + monto * factor);
      ingresosBrutos       = n(ingresosBrutos   + monto * factor);
    }

    const tasa        = 1.75;
    const pagoACuenta = n(ingresosBrutos * tasa / 100);

    return {
      mes, anio, nombreMes: MESES[mes - 1],
      ingresosBrutos: n(ingresosBrutos),
      tasa,
      pagoACuenta,
      porTipo: Object.entries(porTipo)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([tipoDte, d]) => ({ tipoDte, ...d })),
    };
  }

  async resumenMes(mes: number, anio: number, empresaId: string) {
    const [cf, ccf, reten] = await Promise.all([
      this.getDtesMes(['01'], mes, anio, empresaId),
      this.getDtesMes(['03','05','06'], mes, anio, empresaId),
      this.getDtesMes(['07'], mes, anio, empresaId),
    ]);

    const sumar = (dtes: Dte[]) => dtes.reduce((acc, d) => {
      const r = resumen(d);
      return {
        cantidad: acc.cantidad + 1,
        exenta:   acc.exenta   + r.totalExenta,
        noSuj:    acc.noSuj    + r.totalNoSuj,
        gravada:  acc.gravada  + r.totalGravada,
        iva:      acc.iva      + r.totalIva,
        total:    acc.total    + r.totalPagar,
      };
    }, { cantidad: 0, exenta: 0, noSuj: 0, gravada: 0, iva: 0, total: 0 });

    const compras = await this.comprasService.resumenMes(mes, anio, empresaId);
    const debitoFiscal  = n(sumar(cf).iva + sumar(ccf).iva);
    const creditoFiscal = compras.ivaCredito;
    const ivaPagar      = n(debitoFiscal - creditoFiscal);

    return {
      mes, anio, nombreMes: MESES[mes - 1],
      cf:   { ...sumar(cf),   filas: cf.map(d => filaResumen(d))   },
      ccf:  { ...sumar(ccf),  filas: ccf.map(d => filaResumen(d))  },
      reten:{ cantidad: reten.length, total: reten.reduce((s,d) => s + n(d.totalPagar), 0) },
      compras,
      f07: { debitoFiscal, creditoFiscal, ivaPagar },
    };
  }

  // ── Excel Libro Ventas CF ────────────────────────────────────────────────

  async excelLibroVentasCf(mes: number, anio: number, empresaId: string): Promise<Buffer> {
    const dtes = await this.getDtesMes(['01'], mes, anio, empresaId);
    const wb   = new ExcelJS.Workbook();
    wb.creator  = 'Sistema DTE El Salvador';
    wb.created  = new Date();

    const ws = wb.addWorksheet('Ventas Consumidores');
    titulo(ws, `LIBRO DE VENTAS A CONSUMIDORES — ${MESES[mes-1].toUpperCase()} ${anio}`, 9);

    ws.columns = [
      { key: 'num',      width: 6  },
      { key: 'fecha',    width: 12 },
      { key: 'control',  width: 32 },
      { key: 'nombre',   width: 30 },
      { key: 'exenta',   width: 13 },
      { key: 'noSuj',    width: 13 },
      { key: 'gravada',  width: 13 },
      { key: 'iva',      width: 12 },
      { key: 'total',    width: 13 },
    ];

    ws.addRow([]);  // fila 3 vacía
    const hdr = ws.addRow(['#','Fecha','N° Control','Receptor','Ventas Exentas','Ventas No Suj.','Ventas Gravadas','IVA Débito','Total']);
    headerStyle(ws, hdr);

    let totExenta = 0, totNoSuj = 0, totGravada = 0, totIva = 0, totTotal = 0;

    dtes.forEach((dte, i) => {
      const r   = resumen(dte);
      const rec = receptor(dte);
      totExenta  += r.totalExenta;
      totNoSuj   += r.totalNoSuj;
      totGravada += r.totalGravada;
      totIva     += r.totalIva;
      totTotal   += r.totalPagar;

      const row = ws.addRow([
        i + 1,
        dte.fechaEmision,
        dte.numeroControl,
        rec.nombre ?? dte.receptorNombre ?? 'Consumidor Final',
        r.totalExenta  || null,
        r.totalNoSuj   || null,
        r.totalGravada || null,
        r.totalIva     || null,
        r.totalPagar,
      ]);
      dataRow(row, i % 2 === 1);
      // Formato moneda en columnas 5-9
      [5,6,7,8,9].forEach(c => {
        const cell = row.getCell(c);
        if (cell.value !== null) cell.numFmt = '"$"#,##0.00';
      });
    });

    // Fila totales
    const tot = ws.addRow(['','','','TOTALES',
      totExenta  || null, totNoSuj || null, totGravada || null, totIva || null, totTotal]);
    totalsRow(tot);
    [5,6,7,8,9].forEach(c => { tot.getCell(c).numFmt = '"$"#,##0.00'; });

    ws.addRow([]);
    ws.addRow([`Total documentos: ${dtes.length}`]);

    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }

  // ── Excel Libro Ventas CCF ───────────────────────────────────────────────

  async excelLibroVentasCcf(mes: number, anio: number, empresaId: string): Promise<Buffer> {
    const dtes = await this.getDtesMes(['03','05','06'], mes, anio, empresaId);
    const wb   = new ExcelJS.Workbook();
    wb.creator  = 'Sistema DTE El Salvador';
    wb.created  = new Date();

    const ws = wb.addWorksheet('Ventas Contribuyentes');
    titulo(ws, `LIBRO DE VENTAS A CONTRIBUYENTES — ${MESES[mes-1].toUpperCase()} ${anio}`, 11);

    ws.columns = [
      { key: 'num',     width: 6  },
      { key: 'tipo',    width: 8  },
      { key: 'fecha',   width: 12 },
      { key: 'control', width: 32 },
      { key: 'nit',     width: 18 },
      { key: 'nrc',     width: 12 },
      { key: 'nombre',  width: 30 },
      { key: 'exenta',  width: 13 },
      { key: 'noSuj',   width: 13 },
      { key: 'gravada', width: 13 },
      { key: 'iva',     width: 12 },
    ];

    ws.addRow([]);
    const hdr = ws.addRow(['#','Tipo','Fecha','N° Control','NIT Receptor','NRC','Nombre','Ventas Exentas','Ventas No Suj.','Ventas Gravadas','IVA Débito']);
    headerStyle(ws, hdr);

    const TIPOS: Record<string,string> = { '03':'CCF','05':'NC','06':'ND' };
    let totExenta = 0, totNoSuj = 0, totGravada = 0, totIva = 0;

    dtes.forEach((dte, i) => {
      const r   = resumen(dte);
      const rec = receptor(dte);
      totExenta  += r.totalExenta;
      totNoSuj   += r.totalNoSuj;
      totGravada += r.totalGravada;
      totIva     += r.totalIva;

      const row = ws.addRow([
        i + 1,
        TIPOS[dte.tipoDte] ?? dte.tipoDte,
        dte.fechaEmision,
        dte.numeroControl,
        rec.nit  ?? '',
        rec.nrc  ?? '',
        rec.nombre ?? dte.receptorNombre ?? '',
        r.totalExenta  || null,
        r.totalNoSuj   || null,
        r.totalGravada || null,
        r.totalIva     || null,
      ]);
      dataRow(row, i % 2 === 1);
      [8,9,10,11].forEach(c => {
        const cell = row.getCell(c);
        if (cell.value !== null) cell.numFmt = '"$"#,##0.00';
      });
    });

    const tot = ws.addRow(['','','','','','','TOTALES',
      totExenta || null, totNoSuj || null, totGravada || null, totIva || null]);
    totalsRow(tot);
    [8,9,10,11].forEach(c => { tot.getCell(c).numFmt = '"$"#,##0.00'; });

    ws.addRow([]);
    ws.addRow([`Total documentos: ${dtes.length}`]);

    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }

  // ── Excel Anexo F-07 ────────────────────────────────────────────────────

  async excelAnexoF07(mes: number, anio: number, empresaId: string): Promise<Buffer> {
    const [cf, ccf, reten] = await Promise.all([
      this.getDtesMes(['01'], mes, anio, empresaId),
      this.getDtesMes(['03','05','06'], mes, anio, empresaId),
      this.getDtesMes(['07'], mes, anio, empresaId),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema DTE El Salvador';
    wb.created = new Date();
    const mesNombre = MESES[mes - 1].toUpperCase();

    // ── Hoja 1: Resumen F-07 ──────────────────────────────────────────────
    const wsRes = wb.addWorksheet('Resumen F-07');
    titulo(wsRes, `ANEXO F-07 — ${mesNombre} ${anio}`, 4);
    wsRes.columns = [{ width: 35 },{ width: 15 },{ width: 15 },{ width: 15 }];

    wsRes.addRow([]);
    const hRes = wsRes.addRow(['Concepto','Operaciones','Monto Base','IVA']);
    headerStyle(wsRes, hRes);

    const sumCf  = cf.reduce((a,d)  => { const r=resumen(d); return { g: a.g+r.totalGravada, e: a.e+r.totalExenta, iva: a.iva+r.totalIva, t: a.t+r.totalPagar }; }, {g:0,e:0,iva:0,t:0});
    const sumCcf = ccf.reduce((a,d) => { const r=resumen(d); return { g: a.g+r.totalGravada, e: a.e+r.totalExenta, iva: a.iva+r.totalIva, t: a.t+r.totalPagar }; }, {g:0,e:0,iva:0,t:0});
    const sumRet = reten.reduce((a,d) => a + n(d.totalPagar), 0);

    const filas = [
      ['Ventas a Consumidores Finales (CF)',  cf.length,  sumCf.g,  sumCf.iva],
      ['Ventas a Contribuyentes (CCF/NC/ND)', ccf.length, sumCcf.g, sumCcf.iva],
      ['Total Ventas Gravadas', cf.length+ccf.length, sumCf.g+sumCcf.g, sumCf.iva+sumCcf.iva],
      ['Total Ventas Exentas',  '',  sumCf.e+sumCcf.e, ''],
      ['IVA Retenido (tipo 07)', reten.length, sumRet, ''],
      ['Débito Fiscal Total', '', '', sumCf.iva+sumCcf.iva],
    ];

    filas.forEach((f, i) => {
      const row = wsRes.addRow(f);
      dataRow(row, i % 2 === 1);
      if (i === 2) totalsRow(row);
      [3,4].forEach(c => {
        const cell = row.getCell(c);
        if (typeof cell.value === 'number') cell.numFmt = '"$"#,##0.00';
      });
    });

    // ── Hoja 2: Detalle CF ────────────────────────────────────────────────
    const wsCf = wb.addWorksheet('Detalle CF');
    titulo(wsCf, `VENTAS CONSUMIDOR FINAL — ${mesNombre} ${anio}`, 7);
    wsCf.columns = [
      {width:6},{width:12},{width:32},{width:28},{width:13},{width:13},{width:13},
    ];
    wsCf.addRow([]);
    headerStyle(wsCf, wsCf.addRow(['#','Fecha','N° Control','Receptor','Exenta','Gravada','IVA']));

    cf.forEach((dte, i) => {
      const r = resumen(dte); const rec = receptor(dte);
      const row = wsCf.addRow([i+1, dte.fechaEmision, dte.numeroControl,
        rec.nombre ?? 'Consumidor Final', r.totalExenta||null, r.totalGravada||null, r.totalIva||null]);
      dataRow(row, i%2===1);
      [5,6,7].forEach(c => { const cell=row.getCell(c); if(cell.value!==null) cell.numFmt='"$"#,##0.00'; });
    });

    // ── Hoja 3: Detalle CCF ───────────────────────────────────────────────
    const wsCcf = wb.addWorksheet('Detalle CCF');
    titulo(wsCcf, `VENTAS CONTRIBUYENTES — ${mesNombre} ${anio}`, 8);
    wsCcf.columns = [
      {width:6},{width:8},{width:12},{width:32},{width:18},{width:28},{width:13},{width:13},
    ];
    wsCcf.addRow([]);
    headerStyle(wsCcf, wsCcf.addRow(['#','Tipo','Fecha','N° Control','NIT','Nombre','Gravada','IVA']));
    const TIPOS: Record<string,string> = {'03':'CCF','05':'NC','06':'ND'};

    ccf.forEach((dte, i) => {
      const r = resumen(dte); const rec = receptor(dte);
      const row = wsCcf.addRow([i+1, TIPOS[dte.tipoDte]??dte.tipoDte,
        dte.fechaEmision, dte.numeroControl, rec.nit??'',
        rec.nombre??dte.receptorNombre??'', r.totalGravada||null, r.totalIva||null]);
      dataRow(row, i%2===1);
      [7,8].forEach(c => { const cell=row.getCell(c); if(cell.value!==null) cell.numFmt='"$"#,##0.00'; });
    });

    // ── Hoja 4: Retenciones ───────────────────────────────────────────────
    if (reten.length > 0) {
      const wsRet = wb.addWorksheet('Retenciones');
      titulo(wsRet, `COMPROBANTES DE RETENCIÓN — ${mesNombre} ${anio}`, 5);
      wsRet.columns = [{width:6},{width:12},{width:32},{width:28},{width:15}];
      wsRet.addRow([]);
      headerStyle(wsRet, wsRet.addRow(['#','Fecha','N° Control','Receptor','IVA Retenido']));
      reten.forEach((dte, i) => {
        const rec = receptor(dte);
        const row = wsRet.addRow([i+1, dte.fechaEmision, dte.numeroControl,
          rec.nombre??dte.receptorNombre??'', n(dte.totalPagar)]);
        dataRow(row, i%2===1);
        row.getCell(5).numFmt = '"$"#,##0.00';
      });
    }

    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CSV F-07 V14 — Archivos para carga en portal Hacienda
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * ANEXO 1 — Detalle de Ventas a Contribuyentes (CCF / NC / ND)
   * Tipos DTE: 03, 05, 06 | Número de Anexo: 1
   * Columnas A-T (20 cols) según Manual F-07 V14 enero 2025
   */
  async csvAnexo1(mes: number, anio: number, empresaId: string): Promise<string> {
    const dtes = await this.getDtesMes(['03', '05', '06'], mes, anio, empresaId);
    const lines: string[] = [];

    for (const dte of dtes) {
      const r   = resumen(dte);
      const rec = receptor(dte);

      // A: Fecha DD/MM/AAAA
      const fecha = fmtFecha(dte.fechaEmision);
      // B: Clase (4 = DTE)
      const clase = '4';
      // C: Tipo de documento (03 CCF, 05 NC, 06 ND)
      const tipo = dte.tipoDte;
      // D: Nº Resolución = numeroControl sin guiones (DTE)
      const resolucion = limpia(dte.numeroControl);
      // E: Nº Serie = sello de recepción del DTE
      const serie = dte.selloRecepcion ?? '';
      // F: Nº Documento = codigoGeneracion sin guiones (32 chars)
      const numDoc = limpia(dte.codigoGeneracion);
      // G: Control Interno → vacío para DTE
      const ctrlInterno = '';
      // H: NIT o NRC del cliente (sin guiones); NIT tiene prioridad
      const nitCliente = limpia(rec.nit ?? rec.nrc ?? '');
      // I: Nombre / Razón Social
      const nombre = rec.nombre ?? dte.receptorNombre ?? '';
      // J: Ventas Exentas
      const exenta = fmtN(r.totalExenta);
      // K: Ventas No Sujetas
      const noSuj = fmtN(r.totalNoSuj);
      // L: Ventas Gravadas Locales (sin IVA)
      const gravada = fmtN(r.totalGravada);
      // M: Débito Fiscal (IVA 13%)
      const debito = fmtN(r.totalIva);
      // N: Ventas cuenta terceros no domiciliados (no aplica por defecto)
      const ventasTerceros = '0.00';
      // O: Débito fiscal cuenta terceros (no aplica)
      const debitoTerceros = '0.00';
      // P: Total Ventas = exenta + noSuj + gravada + IVA
      const totalVentas = fmtN(r.totalExenta + r.totalNoSuj + r.totalGravada + r.totalIva);
      // Q: DUI del cliente → vacío (contribuyentes tienen NIT, no DUI)
      const dui = '';
      // R: Tipo Operación Renta (1=Gravada) — vigente desde enero 2025
      const tipoOp = '1';
      // S: Tipo Ingreso Renta (3=Actividades Comerciales)
      const tipoIngreso = '3';
      // T: Número de Anexo = 1
      const numAnexo = '1';

      lines.push(csvLn([
        fecha, clase, tipo, resolucion, serie, numDoc, ctrlInterno,
        nitCliente, nombre, exenta, noSuj, gravada, debito,
        ventasTerceros, debitoTerceros, totalVentas, dui,
        tipoOp, tipoIngreso, numAnexo,
      ]));
    }

    return lines.join('\r\n');
  }

  /**
   * ANEXO 2 — Detalle de Ventas a Consumidor Final (CF)
   * Tipo DTE: 01 | Número de Anexo: 2
   * Columnas A-W (23 cols) — agrupado por día
   * Ventas Gravadas Locales (col N) incluye IVA (así lo exige Hacienda para CF)
   */
  async csvAnexo2(mes: number, anio: number, empresaId: string): Promise<string> {
    const dtes = await this.getDtesMes(['01'], mes, anio, empresaId);
    const lines: string[] = [];

    // Agrupar por día (fechaEmision YYYY-MM-DD)
    const byDay = new Map<string, Dte[]>();
    for (const dte of dtes) {
      const key = dte.fechaEmision;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(dte);
    }

    // Ordenar días cronológicamente
    const diasOrdenados = [...byDay.keys()].sort();

    for (const fechaKey of diasOrdenados) {
      const grupo = byDay.get(fechaKey)!;
      // Ordenar dentro del día por numeroControl para obtener primero/último
      grupo.sort((a, b) => a.numeroControl.localeCompare(b.numeroControl));

      const primerDte = grupo[0];
      const ultimoDte = grupo[grupo.length - 1];

      // Sumar montos del día
      let sumExenta = 0, sumNoSuj = 0, sumGravada = 0, sumIva = 0, sumTotal = 0;
      for (const d of grupo) {
        const r = resumen(d);
        sumExenta  += r.totalExenta;
        sumNoSuj   += r.totalNoSuj;
        sumGravada += r.totalGravada;
        sumIva     += r.totalIva;
        sumTotal   += r.totalPagar;
      }

      // A: Fecha
      const fecha = fmtFecha(fechaKey);
      // B: Clase (4 = DTE)
      const clase = '4';
      // C: Tipo (01 = Factura CF)
      const tipo = '01';
      // D, E: N/A para DTE (se agrupan por día)
      const resolucion = 'N/A';
      const serie      = 'N/A';
      // F, G: Control Interno Del / Al → N/A para DTE
      const ctrlDel = 'N/A';
      const ctrlAl  = 'N/A';
      // H: N° Doc Del = codigoGeneracion del primer DTE del día (sin guiones)
      const numDocDel = limpia(primerDte.codigoGeneracion);
      // I: N° Doc Al = codigoGeneracion del último DTE del día (sin guiones)
      const numDocAl = limpia(ultimoDte.codigoGeneracion);
      // J: N° Máquina Registradora → vacío (DTEs no usan máquina)
      const maquina = '';
      // K: Ventas Exentas
      const exenta = fmtN(sumExenta);
      // L: Ventas internas exentas no sujetas a proporcionalidad (no aplica)
      const exentaNoProp = '0.00';
      // M: Ventas No Sujetas
      const noSuj = fmtN(sumNoSuj);
      // N: Ventas Gravadas Locales CON IVA incluido (Hacienda así lo requiere para CF)
      const gravadaConIva = fmtN(sumGravada + sumIva);
      // O-R: Exportaciones y zonas francas (no aplica)
      const expCA = '0.00', expFueraCA = '0.00', expServ = '0.00', zonasFrancas = '0.00';
      // S: Ventas cuenta terceros no domiciliados
      const ventasTerceros = '0.00';
      // T: Total Ventas
      const totalVentas = fmtN(sumTotal);
      // U: Tipo Operación Renta (1=Gravada) — desde enero 2025
      const tipoOp = '1';
      // V: Tipo Ingreso Renta (3=Actividades Comerciales)
      const tipoIngreso = '3';
      // W: Número de Anexo = 2
      const numAnexo = '2';

      lines.push(csvLn([
        fecha, clase, tipo, resolucion, serie, ctrlDel, ctrlAl,
        numDocDel, numDocAl, maquina,
        exenta, exentaNoProp, noSuj, gravadaConIva,
        expCA, expFueraCA, expServ, zonasFrancas, ventasTerceros,
        totalVentas, tipoOp, tipoIngreso, numAnexo,
      ]));
    }

    return lines.join('\r\n');
  }

  /**
   * ANEXO 3 — Detalle de Compras
   * Columnas A-U (21 cols) | Número de Anexo: 3
   * Nuevas columnas Q,R,S,T activas desde febrero 2024
   */
  async csvAnexo3(mes: number, anio: number, empresaId: string): Promise<string> {
    const compras = await this.comprasService.getComprasMes(mes, anio, empresaId);
    const lines: string[] = [];

    for (const c of compras) {
      const esDte = !!c.codigoGeneracion;
      const esOtros = ['12', '13'].includes(c.tipoDte); // Decl. Mercancías, Mandamiento

      // A: Fecha DD/MM/AAAA
      const fecha = fmtFecha(c.fechaEmision);
      // B: Clase (4=DTE, 3=Otros para tipo 12/13, 1=Impreso)
      const clase = esDte ? '4' : (esOtros ? '3' : '1');
      // C: Tipo de documento
      const tipo = c.tipoDte;
      // D: Nº Documento (codigoGeneracion sin guiones para DTE, numeroControl para otros)
      const numDoc = esDte ? limpia(c.codigoGeneracion) : (c.numeroControl ?? '');
      // E: NIT o NRC del proveedor (sin guiones; NIT tiene prioridad)
      const nitProv = limpia(c.proveedorNit ?? c.proveedorNrc ?? '');
      // F: Nombre del proveedor
      const nombreProv = c.proveedorNombre;
      // G: Compras internas exentas y/o no sujetas
      const compExenta = fmtN(Number(c.compraExenta) + Number(c.compraNoSujeta));
      // H: Internaciones exentas y/o no sujetas (no aplica)
      const internExenta = '0.00';
      // I: Importaciones exentas y/o no sujetas (no aplica)
      const importExenta = '0.00';
      // J: Compras internas gravadas
      const compGravada = fmtN(c.compraGravada);
      // K: Internaciones gravadas de bienes (no aplica)
      const internGravada = '0.00';
      // L: Importaciones gravadas de bienes (no aplica)
      const importGravadaBienes = '0.00';
      // M: Importaciones gravadas de servicios (no aplica)
      const importGravadaServ = '0.00';
      // N: Crédito Fiscal (IVA deducible)
      const creditoFiscal = fmtN(c.ivaCredito);
      // O: Total de compras
      const totalCompras = fmtN(c.totalCompra);
      // P: DUI del proveedor (vacío — proveedores contribuyentes tienen NIT)
      const duiProv = '';
      // Q: Tipo de Operación (1=Gravada) — activo desde feb 2024
      const tipoOp = '1';
      // R: Clasificación (2=Gasto; ajustar a 1=Costo si aplica)
      const clasificacion = '2';
      // S: Sector (2=Comercio; ajustar según actividad económica)
      const sector = '2';
      // T: Tipo Costo/Gasto (1=Gastos de Venta sin Donación)
      const tipoCosto = '1';
      // U: Número de Anexo = 3
      const numAnexo = '3';

      lines.push(csvLn([
        fecha, clase, tipo, numDoc, nitProv, nombreProv,
        compExenta, internExenta, importExenta, compGravada,
        internGravada, importGravadaBienes, importGravadaServ,
        creditoFiscal, totalCompras, duiProv,
        tipoOp, clasificacion, sector, tipoCosto, numAnexo,
      ]));
    }

    return lines.join('\r\n');
  }
}

// helper externo para mapear fila de resumen JSON
function filaResumen(dte: Dte) {
  const r   = resumen(dte);
  const rec = (dte.jsonDte as any)?.receptor ?? (dte.jsonDte as any)?.sujetoExcluido ?? (dte.jsonDte as any)?.donatario ?? {};
  return {
    fecha:    dte.fechaEmision,
    control:  dte.numeroControl,
    nombre:   rec.nombre ?? dte.receptorNombre ?? '',
    nit:      rec.nit ?? '',
    exenta:   r.totalExenta,
    noSuj:    r.totalNoSuj,
    gravada:  r.totalGravada,
    iva:      r.totalIva,
    total:    r.totalPagar,
    estado:   dte.estado,
  };
}
