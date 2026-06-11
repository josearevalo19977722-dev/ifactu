import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dte } from '../dte/entities/dte.entity';
import { ComprasService } from '../compras/compras.service';
import * as ExcelJS from 'exceljs';

// ─── helpers CSV F-07 ────────────────────────────────────────────────────────

/** YYYY-MM-DD (o ISO timestamp) → DD/MM/AAAA */
function fmtFecha(fecha: string): string {
  // Strip timestamp si viene con hora (ej: "2026-01-15T00:00:00.000Z")
  const s = String(fecha).split('T')[0].trim();
  // Si no tiene formato YYYY-MM-DD reconocible, devolver tal cual
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
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

/**
 * Construye una línea CSV con separador PUNTO Y COMA (;)
 * El portal Hacienda F-07 exige ";" — manual sección II c) indica
 * configurar el "Separador de listas" a punto y coma en Windows.
 */
function csvLn(fields: (string | number | null | undefined)[]): string {
  return fields.map(f => {
    const s = String(f ?? '');
    // Escapar campos que contengan ; " o saltos de línea
    return s.includes(';') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(';');
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
    // CCF guarda el IVA en tributos[0].valor, no en totalIva directamente
    totalIva:      n(r.totalIva      ?? r.tributos?.[0]?.valor ?? r.ivaPerci1 ?? 0),
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

  // Obtener DTEs de un mes/año para un tipo dado, filtrados por empresa y ambiente producción.
  // Solo incluye RECIBIDO y CONTINGENCIA — rechazados/pendientes/anulados no se reportan.
  private async getDtesMes(tipos: string[], mes: number, anio: number, empresaId: string): Promise<Dte[]> {
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hasta = new Date(anio, mes, 0); // último día del mes
    const hastaStr = `${anio}-${String(mes).padStart(2,'0')}-${String(hasta.getDate()).padStart(2,'0')}`;

    return this.dteRepo
      .createQueryBuilder('dte')
      .where('dte.tipoDte IN (:...tipos)', { tipos })
      .andWhere('dte.fechaEmision >= :desde', { desde })
      .andWhere('dte.fechaEmision <= :hasta', { hasta: hastaStr })
      .andWhere("dte.estado IN ('RECIBIDO', 'CONTINGENCIA')")
      .andWhere('dte.empresaId = :empresaId', { empresaId })
      .andWhere("dte.ambiente = '01'")
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
    const [cf, allCcf, reten] = await Promise.all([
      this.getDtesMes(['01'],          mes, anio, empresaId),
      this.getDtesMes(['03','05','06'],mes, anio, empresaId),
      this.getDtesMes(['07'],          mes, anio, empresaId),
    ]);

    // Separar CCF, NC emitidas y ND emitidas para cálculo correcto
    const ccfFacturas = allCcf.filter(d => d.tipoDte === '03');
    const ncEmitidas  = allCcf.filter(d => d.tipoDte === '05');
    const ndEmitidas  = allCcf.filter(d => d.tipoDte === '06');

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

    const sumCf  = sumar(cf);
    const sumCcf = sumar(ccfFacturas);
    const sumNC  = sumar(ncEmitidas);
    const sumND  = sumar(ndEmitidas);

    // Bug fix 1 — CF: IVA = bruto × 13/113 (alinea con cálculo del portal y evita
    //             diferencia de $0.15 por suma de IVAs individuales redondeados)
    const ivaCf = n(sumCf.gravada * 13 / 113);

    // Bug fix 2 — CCF/NC/ND: NC emitidas RESTAN del débito
    //             (devolviste dinero al cliente → reduce lo que debes al fisco)
    const ivaCcfNeto = n(sumCcf.iva + sumND.iva - sumNC.iva);

    const compras       = await this.comprasService.resumenMes(mes, anio, empresaId);
    const debitoFiscal  = n(ivaCf + ivaCcfNeto);
    const creditoFiscal = compras.ivaCredito;
    const ivaPagar      = n(debitoFiscal - creditoFiscal);

    return {
      mes, anio, nombreMes: MESES[mes - 1],
      cf:   { ...sumCf,  filas: cf.map(d => filaResumen(d))          },
      ccf:  { ...sumar(allCcf), filas: allCcf.map(d => filaResumen(d)) }, // total combinado para tablas
      // Desglose para pantalla F-07
      ccfDetalle: {
        facturas:  { ...sumCcf, filas: ccfFacturas.map(d => filaResumen(d)) },
        ncEmitidas:{ ...sumNC,  filas: ncEmitidas.map(d => filaResumen(d))  },
        ndEmitidas:{ ...sumND,  filas: ndEmitidas.map(d => filaResumen(d))  },
        ivaDebito: ivaCcfNeto,
      },
      reten:{ cantidad: reten.length, total: reten.reduce((s,d) => s + n(d.totalPagar), 0) },
      compras,
      f07: {
        debitoFiscal,
        creditoFiscal,
        ivaPagar,
        // Desglose completo para que el frontend muestre breakdown
        desglose: {
          ivaCf,
          ivaCcf:      sumCcf.iva,
          ivaNC:       sumNC.iva,   // NC emitidas (resta débito)
          ivaND:       sumND.iva,   // ND emitidas (suma débito)
          creditoBruto:            n(compras.ivaCredito + compras.ivaNC),
          ivaNCCompras:            compras.ivaNC,  // NC recibidas (resta crédito)
        },
      },
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
    const [cf, allCcf, reten] = await Promise.all([
      this.getDtesMes(['01'],          mes, anio, empresaId),
      this.getDtesMes(['03','05','06'],mes, anio, empresaId),
      this.getDtesMes(['07'],          mes, anio, empresaId),
    ]);

    const ccfFacturas = allCcf.filter(d => d.tipoDte === '03');
    const ncEmitidas  = allCcf.filter(d => d.tipoDte === '05');
    const ndEmitidas  = allCcf.filter(d => d.tipoDte === '06');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema DTE El Salvador';
    wb.created = new Date();
    const mesNombre = MESES[mes - 1].toUpperCase();

    // ── Hoja 1: Resumen F-07 ──────────────────────────────────────────────
    const wsRes = wb.addWorksheet('Resumen F-07');
    titulo(wsRes, `ANEXO F-07 — ${mesNombre} ${anio}`, 4);
    wsRes.columns = [{ width: 38 },{ width: 15 },{ width: 15 },{ width: 15 }];

    wsRes.addRow([]);
    const hRes = wsRes.addRow(['Concepto','Operaciones','Monto Base','IVA']);
    headerStyle(wsRes, hRes);

    const s = (dtes: Dte[]) => dtes.reduce(
      (a,d) => { const r=resumen(d); return { g:a.g+r.totalGravada, e:a.e+r.totalExenta, iva:a.iva+r.totalIva, t:a.t+r.totalPagar }; },
      {g:0,e:0,iva:0,t:0},
    );
    const sumCf  = s(cf);
    const sumCcf = s(ccfFacturas);
    const sumNC  = s(ncEmitidas);
    const sumND  = s(ndEmitidas);
    const sumRet = reten.reduce((a,d) => a + n(d.totalPagar), 0);

    // CF: IVA = bruto × 13/113; CCF neto = CCF + ND - NC
    const ivaCf       = n(sumCf.g * 13 / 113);
    const ivaCcfNeto  = n(sumCcf.iva + sumND.iva - sumNC.iva);
    const debitoTotal = n(ivaCf + ivaCcfNeto);

    // Datos de compras para el resumen Excel
    const comprasXls = await this.comprasService.resumenMes(mes, anio, empresaId);
    const creditoFiscal = comprasXls.ivaCredito;
    const ivaPagar      = n(debitoTotal - creditoFiscal);

    const filas: (string|number|null)[][] = [
      ['DÉBITO FISCAL',                           '',                  '',                             ''],
      ['  Ventas a Consumidores Finales (CF)',     cf.length,           n(sumCf.g/1.13),               ivaCf],
      ['  Ventas a Contribuyentes (CCF)',          ccfFacturas.length,  sumCcf.g,                      sumCcf.iva],
      ['  (-) Notas de Crédito emitidas (NC)',     ncEmitidas.length,   ncEmitidas.length ? -sumNC.g : null, ncEmitidas.length ? -sumNC.iva : null],
      ['  (+) Notas de Débito emitidas (ND)',      ndEmitidas.length,   ndEmitidas.length ? sumND.g : null,  ndEmitidas.length ? sumND.iva : null],
      ['  Débito Fiscal Total',                    '',                  '',                            debitoTotal],
      ['', '', '', ''],
      ['CRÉDITO FISCAL (COMPRAS)',                 '',                  '',                            ''],
      // Monto Base = BRUTO antes de NC = neto + base_NC; base_NC = ivaNC / 0.13
      // IVA       = BRUTO antes de NC = neto + ivaNC
      ['  Compras CCF recibidas',                  comprasXls.cantidad - comprasXls.cantidadNC, n(comprasXls.compraGravada + comprasXls.ivaNC / 0.13), n(comprasXls.ivaCredito + comprasXls.ivaNC)],
      ['  (-) Notas de Crédito recibidas (NC)',    comprasXls.cantidadNC, comprasXls.cantidadNC ? -(comprasXls.ivaNC / 0.13) : null, comprasXls.cantidadNC ? -comprasXls.ivaNC : null],
      ['  Crédito Fiscal Total',                   '',                  '',                            creditoFiscal],
      ['', '', '', ''],
      ['IVA A PAGAR',                              '',                  '',                            ivaPagar],
      ['IVA Retenido (tipo 07)',                   reten.length,        sumRet,                        ''],
    ];

    filas.forEach((f, i) => {
      const row = wsRes.addRow(f);
      const isSection = f[1] === '' && f[2] === '' && f[3] === '';
      if (!isSection) dataRow(row, i % 2 === 1);
      if (f[0] === '  Débito Fiscal Total' || f[0] === 'IVA A PAGAR') totalsRow(row);
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
    headerStyle(wsCf, wsCf.addRow(['#','Fecha','N° Control','Receptor','Exenta','Gravada (bruto)','IVA (13/113)']));

    cf.forEach((dte, i) => {
      const r = resumen(dte); const rec = receptor(dte);
      const row = wsCf.addRow([i+1, fmtFecha(dte.fechaEmision), dte.numeroControl,
        rec.nombre ?? 'Consumidor Final', r.totalExenta||null, r.totalGravada||null,
        r.totalGravada ? n(r.totalGravada * 13/113) : null]);
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
    headerStyle(wsCcf, wsCcf.addRow(['#','Tipo','Fecha','N° Control','NIT','Nombre','Base','IVA','Efecto']));
    const TIPOS: Record<string,string> = {'03':'CCF','05':'NC','06':'ND'};

    allCcf.forEach((dte, i) => {
      const r   = resumen(dte); const rec = receptor(dte);
      const esNC = dte.tipoDte === '05';
      // NC resta al débito → mostrar en negativo para que el contador lo identifique
      const signo = esNC ? -1 : 1;
      const row = wsCcf.addRow([
        i+1, TIPOS[dte.tipoDte]??dte.tipoDte,
        fmtFecha(dte.fechaEmision), dte.numeroControl, rec.nit??'',
        rec.nombre??dte.receptorNombre??'',
        r.totalGravada||null,
        r.totalIva ? signo * r.totalIva : null,
        esNC ? '(resta débito)' : '',
      ]);
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
        const row = wsRet.addRow([i+1, fmtFecha(dte.fechaEmision), dte.numeroControl,
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
      // H: NIT o NRC del cliente | Q: DUI — mutuamente excluyentes (igual que Anexo 3)
      // Si el identificador tiene 9 dígitos = DUI → col H vacío, DUI va en col Q
      const rawNitClient  = limpia(rec.nit ?? rec.nrc ?? '');
      const esDuiCliente  = rawNitClient.length === 9;
      const nitCliente    = esDuiCliente ? '' : rawNitClient;
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
      // Q: DUI del cliente (solo si receptor es persona natural con DUI de 9 dígitos)
      const dui = esDuiCliente ? rawNitClient : '';
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
      // N: Ventas Gravadas Locales CON IVA incluido (para CF, totalGravada ya es bruto)
      // Bug fix: sumGravada ya incluye IVA en CF (montos brutos), sumar sumIva era duplicar
      const gravadaConIva = fmtN(sumGravada);
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
   * Columnas A-X (24 cols) según Manual F-07 V14 enero 2025 | Número de Anexo: 3
   *
   * Estructura DTE:
   *   D = numeroControl sin guiones (28 chars)
   *   E = selloRecepcion (40 chars)
   *   F = vacío (control interno)
   *   G = codigoGeneracion sin guiones (32 chars)
   *
   * Columnas financieras (J-T):
   *   J  Internaciones Exentas
   *   K  Internaciones Gravadas
   *   L  Crédito Fiscal por Internaciones
   *   M  Importaciones Exentas
   *   N  Importaciones Gravadas
   *   O  Crédito Fiscal por Importaciones
   *   P  Compras Internas Exentas
   *   Q  Compras Internas No Sujetas
   *   R  Compras Internas Gravadas
   *   S  Crédito Fiscal
   *   T  Total Compras
   */
  async csvAnexo3(mes: number, anio: number, empresaId: string): Promise<string> {
    const compras = await this.comprasService.getComprasMes(mes, anio, empresaId);
    const lines: string[] = [];

    // ─── Estructura Anexo 3 F-07 V14 — 21 columnas (A-U) ─────────────────────
    // Ref: Manual Usuario F-07 V14 sección V "Detalle de Compras"
    // Columnas Q,R,S,T vigentes desde Febrero 2024 (colocar 0 para periodos anteriores)

    for (const c of compras) {
      const esDte   = !!c.codigoGeneracion;
      const esOtros = ['12', '13'].includes(c.tipoDte); // Decl. Mercancías / Mandamiento

      // A: Fecha DD/MM/AAAA
      const fecha = fmtFecha(c.fechaEmision);
      // B: Clase (4=DTE, 3=Otros tipo 12/13, 1=Impreso por Imprenta)
      const clase = esDte ? '4' : (esOtros ? '3' : '1');
      // C: Tipo de documento (03=CCF, 05=NC, 06=ND, 12=Decl.Mercancías, 13=Mandamiento)
      const tipo = c.tipoDte;

      // D: Número de documento — codigoGeneracion sin guiones para DTE (desde nov 2022)
      //    Para documentos no-DTE: número de control del documento
      const numDoc = esDte
        ? limpia(c.codigoGeneracion ?? '')
        : (c.numeroControl ?? '');

      // E: NIT o NRC del proveedor | P: DUI — son mutuamente excluyentes
      // Si el identificador tiene 9 dígitos = DUI → E vacío, DUI va en P
      const rawId     = limpia(c.proveedorNit ?? c.proveedorNrc ?? '');
      const esDuiProv = rawId.length === 9;
      const nitProv   = esDuiProv ? '' : rawId;

      // F: Nombre, razón social o denominación del proveedor
      const nombreProv = c.proveedorNombre ?? '';

      // G: Compras internas exentas y/o no sujetas (combinadas en una sola columna)
      // Usar n() para forzar conversión a number — TypeORM puede devolver strings desde la DB
      const compIntExenta = fmtN(n(c.compraExenta) + n(c.compraNoSujeta));
      // H: Internaciones exentas y/o no sujetas (Decl. Mercancías — 0 para compras locales)
      const internExenta = '0.00';
      // I: Importaciones exentas y/o no sujetas (Mandamiento — 0 para compras locales)
      const importExenta = '0.00';
      // J: Compras internas gravadas (BASE sin IVA)
      const compIntGravada = fmtN(c.compraGravada);
      // K: Internaciones gravadas de bienes (0 para compras locales)
      const internGravada = '0.00';
      // L: Importaciones gravadas de bienes (0 para compras locales)
      const importGravadaBienes = '0.00';
      // M: Importaciones gravadas de servicios (Mandamiento — 0 para compras locales)
      const importGravadaServ = '0.00';
      // N: Crédito fiscal = 13% de (J+K+L+M)
      const creditoFiscal = fmtN(c.ivaCredito);
      // O: Total de compras = G+H+I+J+K+L+M (suma de columnas SIN IVA)
      const totalCompras = fmtN(n(c.compraExenta) + n(c.compraNoSujeta) + n(c.compraGravada));
      // P: DUI del proveedor (solo personas naturales, 9 dígitos, desde enero 2022)
      const duiProv = esDuiProv ? rawId : '';

      // Q: Tipo de Operación (1=Gravada, 2=No Gravada, 3=Excluido, 4=Mixta)
      const tipoOp   = '1';
      // R: Clasificación (1=Costo, 2=Gasto)
      const clasif   = '2';
      // S: Sector (1=Industria, 2=Comercio, 3=Agropecuaria, 4=Servicios)
      const sector   = '2';
      // T: Tipo de Costo/Gasto (1=GtosVenta, 2=GtosAdmin, 3=GtosFin, 4=CostoImp,
      //    5=CostoInterno, 6=CIF, 7=ManoObra, 9=No deducible/Inst.Pública)
      const tipoCosto = '2';
      // U: Número de Anexo = 3
      const numAnexo = '3';

      lines.push(csvLn([
        fecha, clase, tipo, numDoc,
        nitProv, nombreProv,
        compIntExenta, internExenta, importExenta,
        compIntGravada, internGravada, importGravadaBienes, importGravadaServ,
        creditoFiscal, totalCompras,
        duiProv,
        tipoOp, clasif, sector, tipoCosto, numAnexo,
      ]));
    }

    return lines.join('\r\n');
  }

  // ── PDF Reporte Ventas ───────────────────────────────────────────────────

  async pdfVentas(mes: number, anio: number, empresaId: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit') as any;

    const cf     = await this.getDtesMes(['01'],           mes, anio, empresaId);
    const allCcf = await this.getDtesMes(['03','05','06'], mes, anio, empresaId);
    const nombreMes = MESES[mes - 1];

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape',
        margins: { top: 36, bottom: 36, left: 36, right: 36 },
        info: { Title: `Ventas ${nombreMes} ${anio}`, Author: 'iFactu' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── layout ─────────────────────────────────────────────────
      // Letter landscape usable: 792 - 72 = 720pt
      const PW = 720;
      const LX = 36;
      const ROW_H = 13;
      const HDR_H = 16;

      // Columns: #, Fecha, Tipo, N° Control, Cód.Gen(20chr), Receptor, NIT, Exenta, Gravada, IVA, Total
      const COLS = [
        { w: 20 }, { w: 52 }, { w: 26 }, { w: 113 }, { w: 88 },
        { w: 120 }, { w: 68 }, { w: 50 }, { w: 54 }, { w: 46 }, { w: 55 },
      ];
      // compute x positions
      let cx = LX;
      COLS.forEach(c => { (c as any).x = cx; cx += c.w; });
      const HEADS = ['#','Fecha','Tipo','N° Control','Cód. Generación','Receptor / Nombre','NIT / DUI','Exenta','Gravada','IVA','Total'];
      const RIGHT_COLS = new Set([7,8,9,10]);

      let y = 36;

      const checkPage = () => {
        if (y > 565) { doc.addPage(); y = 36; }
      };

      const cell = (col: number, text: string, opts: { bold?: boolean, size?: number, color?: string } = {}) => {
        const c = COLS[col] as any;
        doc.fontSize(opts.size ?? 7)
           .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
           .fillColor(opts.color ?? '#111111');
        const align = RIGHT_COLS.has(col) ? 'right' : 'left';
        doc.text(String(text ?? ''), c.x + 2, y + 2, { width: c.w - 4, lineBreak: false, align });
      };

      const drawHLine = (color = '#e2e8f0', lw = 0.3) =>
        doc.moveTo(LX, y).lineTo(LX + PW, y).strokeColor(color).lineWidth(lw).stroke();

      const drawColHeaders = () => {
        doc.rect(LX, y, PW, HDR_H).fill('#dbeafe');
        HEADS.forEach((h, i) => cell(i, h, { bold: true, size: 7, color: '#1e3a8a' }));
        y += HDR_H;
        drawHLine('#93c5fd', 0.5);
      };

      const drawSectionBanner = (text: string) => {
        doc.rect(LX, y, PW, 15).fill('#1d4ed8');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('white')
           .text(text, LX + 4, y + 3, { width: PW - 8, lineBreak: false });
        doc.fillColor('#111111');
        y += 15;
      };

      const drawDataRow = (vals: string[], shade: boolean) => {
        checkPage();
        if (shade) doc.rect(LX, y, PW, ROW_H).fill('#f8fafc');
        vals.forEach((v, i) => cell(i, v));
        y += ROW_H;
        drawHLine();
      };

      const drawTotals = (vals: string[]) => {
        doc.rect(LX, y, PW, HDR_H).fill('#bfdbfe');
        vals.forEach((v, i) => cell(i, v, { bold: true, size: 7.5, color: '#1e3a8a' }));
        y += HDR_H;
      };

      const $v = (v: number) => v ? `$${v.toFixed(2)}` : '—';
      const codG = (s: string | null) => {
        if (!s) return '—';
        const clean = s.replace(/-/g, '');
        return clean.length > 20 ? clean.substring(0, 20) + '…' : clean;
      };
      const tipoLabel = (t: string) => ({ '01':'CF','03':'CCF','05':'NC','06':'ND' }[t] ?? t);

      // ── Title ───────────────────────────────────────────────────
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111')
         .text(`REPORTE DE VENTAS — ${nombreMes.toUpperCase()} ${anio}`, LX, y, { width: PW });
      y += 16;
      doc.fontSize(8.5).font('Helvetica').fillColor('#555')
         .text(`Generado: ${new Date().toLocaleDateString('es-SV', { dateStyle: 'long' })}`, LX, y, { width: PW });
      y += 16;

      // ── CF ──────────────────────────────────────────────────────
      if (cf.length > 0) {
        drawSectionBanner(`VENTAS A CONSUMIDOR FINAL (CF) — ${cf.length} documento(s)`);
        drawColHeaders();
        let [tEx, tGr, tIva, tTot] = [0, 0, 0, 0];
        cf.forEach((d, i) => {
          const r = resumen(d); const rec = receptor(d);
          tEx += r.totalExenta; tGr += r.totalGravada; tIva += r.totalIva; tTot += r.totalPagar;
          drawDataRow([
            String(i + 1), fmtFecha(d.fechaEmision), tipoLabel(d.tipoDte),
            d.numeroControl ?? '—', codG(d.codigoGeneracion),
            (rec.nombre ?? d.receptorNombre ?? 'Consumidor Final').substring(0, 30),
            rec.nit ?? rec.dui ?? '—',
            $v(r.totalExenta), $v(r.totalGravada), $v(r.totalIva), $v(r.totalPagar),
          ], i % 2 === 1);
        });
        drawTotals(['TOTALES','','','','','','', $v(n(tEx)), $v(n(tGr)), $v(n(tIva)), $v(n(tTot))]);
        y += 8;
      }

      // ── CCF / NC / ND ───────────────────────────────────────────
      if (allCcf.length > 0) {
        if (y > 460) { doc.addPage(); y = 36; }
        drawSectionBanner(`VENTAS A CONTRIBUYENTES (CCF / NC / ND) — ${allCcf.length} documento(s)`);
        drawColHeaders();
        let [tEx, tGr, tIva, tTot] = [0, 0, 0, 0];
        allCcf.forEach((d, i) => {
          const r = resumen(d); const rec = receptor(d);
          tEx += r.totalExenta; tGr += r.totalGravada; tIva += r.totalIva; tTot += r.totalPagar;
          drawDataRow([
            String(i + 1), fmtFecha(d.fechaEmision), tipoLabel(d.tipoDte),
            d.numeroControl ?? '—', codG(d.codigoGeneracion),
            (rec.nombre ?? d.receptorNombre ?? '').substring(0, 30),
            rec.nit ?? '—',
            $v(r.totalExenta), $v(r.totalGravada), $v(r.totalIva), $v(r.totalPagar),
          ], i % 2 === 1);
        });
        drawTotals(['TOTALES','','','','','','', $v(n(tEx)), $v(n(tGr)), $v(n(tIva)), $v(n(tTot))]);
      }

      doc.end();
    });
  }

  // ── PDF Reporte Compras ──────────────────────────────────────────────────

  async pdfCompras(mes: number, anio: number, empresaId: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit') as any;

    const compras   = await this.comprasService.getComprasMes(mes, anio, empresaId);
    const nombreMes = MESES[mes - 1];

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape',
        margins: { top: 36, bottom: 36, left: 36, right: 36 },
        info: { Title: `Compras ${nombreMes} ${anio}`, Author: 'iFactu' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW = 720; const LX = 36;
      const ROW_H = 13; const HDR_H = 16;

      // Columns: #, Fecha, Tipo, N° Control, Cód.Gen, Proveedor, NIT, Exenta, No Suj, Gravada, IVA, Total
      const COLS = [
        { w: 20 }, { w: 52 }, { w: 26 }, { w: 110 }, { w: 85 },
        { w: 115 }, { w: 66 }, { w: 46 }, { w: 46 }, { w: 50 }, { w: 46 }, { w: 52 },
      ];
      let cx = LX; COLS.forEach(c => { (c as any).x = cx; cx += c.w; });
      const HEADS = ['#','Fecha','Tipo','N° Control','Cód. Generación','Proveedor','NIT / NRC','Exenta','No Suj.','Gravada','IVA','Total'];
      const RIGHT_COLS = new Set([7,8,9,10,11]);

      let y = 36;

      const checkPage = () => { if (y > 565) { doc.addPage(); y = 36; } };

      const cell = (col: number, text: string, opts: { bold?: boolean, size?: number, color?: string } = {}) => {
        const c = COLS[col] as any;
        doc.fontSize(opts.size ?? 7).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(opts.color ?? '#111');
        const align = RIGHT_COLS.has(col) ? 'right' : 'left';
        doc.text(String(text ?? ''), c.x + 2, y + 2, { width: c.w - 4, lineBreak: false, align });
      };

      const drawHLine = (color = '#e2e8f0', lw = 0.3) =>
        doc.moveTo(LX, y).lineTo(LX + PW, y).strokeColor(color).lineWidth(lw).stroke();

      const drawColHeaders = () => {
        doc.rect(LX, y, PW, HDR_H).fill('#d1fae5');
        HEADS.forEach((h, i) => cell(i, h, { bold: true, size: 7, color: '#065f46' }));
        y += HDR_H; drawHLine('#6ee7b7', 0.5);
      };

      const drawSectionBanner = (text: string) => {
        doc.rect(LX, y, PW, 15).fill('#059669');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('white')
           .text(text, LX + 4, y + 3, { width: PW - 8, lineBreak: false });
        doc.fillColor('#111'); y += 15;
      };

      const drawDataRow = (vals: string[], shade: boolean, isNC = false) => {
        checkPage();
        if (isNC)        doc.rect(LX, y, PW, ROW_H).fill('#fef9c3');
        else if (shade)  doc.rect(LX, y, PW, ROW_H).fill('#f0fdf4');
        vals.forEach((v, i) => cell(i, v));
        y += ROW_H; drawHLine();
      };

      const drawTotals = (vals: string[]) => {
        doc.rect(LX, y, PW, HDR_H).fill('#a7f3d0');
        vals.forEach((v, i) => cell(i, v, { bold: true, size: 7.5, color: '#064e3b' }));
        y += HDR_H;
      };

      const $v = (v: number) => v ? `$${v.toFixed(2)}` : '—';
      const codG = (s: string | null) => {
        if (!s) return '—';
        const clean = s.replace(/-/g, '');
        return clean.length > 20 ? clean.substring(0, 20) + '…' : clean;
      };
      const tipoLabel = (t: string) =>
        ({ '01':'CF','03':'CCF','05':'NC','06':'ND','11':'FEXE','14':'FSE' }[t] ?? t);

      // Title
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111')
         .text(`REPORTE DE COMPRAS — ${nombreMes.toUpperCase()} ${anio}`, LX, y, { width: PW });
      y += 16;
      doc.fontSize(8.5).font('Helvetica').fillColor('#555')
         .text(`Generado: ${new Date().toLocaleDateString('es-SV', { dateStyle: 'long' })}  ·  Total registros: ${compras.length}`, LX, y, { width: PW });
      y += 16;

      drawSectionBanner(`COMPRAS DEL PERÍODO — ${compras.length} registro(s)`);
      drawColHeaders();

      let [tEx, tNoSuj, tGr, tIva, tTot] = [0, 0, 0, 0, 0];
      compras.forEach((c, i) => {
        const isNC = c.tipoDte === '05';
        const signo = isNC ? -1 : 1;
        const ex   = n(signo * Number(c.compraExenta));
        const noSuj = n(signo * Number(c.compraNoSujeta));
        const gr   = n(signo * Number(c.compraGravada));
        const iva  = n(signo * Number(c.ivaCredito));
        const tot  = n(signo * Number(c.totalCompra));
        tEx += ex; tNoSuj += noSuj; tGr += gr; tIva += iva; tTot += tot;
        drawDataRow([
          String(i + 1),
          fmtFecha(c.fechaEmision),
          tipoLabel(c.tipoDte),
          c.numeroControl ?? '—',
          codG(c.codigoGeneracion),
          (c.proveedorNombre ?? '').substring(0, 28),
          c.proveedorNit ?? c.proveedorNrc ?? '—',
          $v(Math.abs(ex)),
          $v(Math.abs(noSuj)),
          $v(Math.abs(gr)),
          $v(Math.abs(iva)),
          isNC ? `(${$v(Math.abs(tot))})` : $v(tot),
        ], i % 2 === 1, isNC);
      });

      drawTotals([
        'TOTALES', '', '', '', '', '', '',
        $v(n(tEx)), $v(n(tNoSuj)), $v(n(tGr)), $v(n(tIva)), $v(n(tTot)),
      ]);

      // NC note if applicable
      const ncCount = compras.filter(c => c.tipoDte === '05').length;
      if (ncCount > 0) {
        y += 8;
        doc.fontSize(7.5).font('Helvetica').fillColor('#b45309')
           .text(`* ${ncCount} Nota(s) de Crédito recibida(s) — se muestran entre paréntesis y reducen el crédito fiscal.`, LX, y, { width: PW });
      }

      doc.end();
    });
  }
}

// helper externo para mapear fila de resumen JSON
function filaResumen(dte: Dte) {
  const r   = resumen(dte);
  const rec = (dte.jsonDte as any)?.receptor ?? (dte.jsonDte as any)?.sujetoExcluido ?? (dte.jsonDte as any)?.donatario ?? {};
  return {
    fecha:    dte.fechaEmision,
    control:  dte.numeroControl,
    codigoGeneracion: dte.codigoGeneracion,
    tipoDte:  dte.tipoDte,
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
