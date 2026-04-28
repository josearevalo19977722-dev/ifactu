import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmpresaPerfil {
  nombreLegal: string; nombreComercial?: string;
  nit: string; nrc: string;
  departamento?: string; municipio?: string;
  complemento?: string; telefono?: string; correo?: string;
  codActividad?: string; descActividad?: string;
}

interface ResumenF07 {
  mes: number; anio: number; nombreMes: string;
  cf:  { cantidad: number; gravada: number; exenta: number; noSuj: number; iva: number; total: number };
  ccf: { cantidad: number; gravada: number; exenta: number; noSuj: number; iva: number; total: number };
  reten: { cantidad: number; total: number };
  compras: { cantidad: number; compraGravada: number; compraExenta: number; compraNoSuj: number; ivaCredito: number; total: number };
  f07: { debitoFiscal: number; creditoFiscal: number; ivaPagar: number };
}

interface PagoACuenta {
  mes: number; anio: number; nombreMes: string;
  ingresosBrutos: number; tasa: number; pagoACuenta: number;
  porTipo: { tipoDte: string; nombre: string; cantidad: number; total: number }[];
}

interface LineaAsiento { cuenta: string; nombreCuenta: string; debe: number; haber: number; }
interface Asiento {
  id: string; fecha: string; descripcion: string; tipo: string;
  totalDebe: number; totalHaber: number; lineas: LineaAsiento[];
}
interface ResumenAsientos {
  mes: number; anio: number; cantidad: number; totalDebe: number; totalHaber: number;
  libroDiario: { codigo: string; nombre: string; debe: number; haber: number; saldo: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n: number | string | undefined | null) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function PillTipo({ tipo }: { tipo: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    DTE_VENTA: { label: 'Venta',   bg: '#dbeafe', color: '#1e40af' },
    COMPRA:    { label: 'Compra',  bg: '#dcfce7', color: '#166534' },
    MANUAL:    { label: 'Manual',  bg: '#fef3c7', color: '#92400e' },
  };
  const s = map[tipo] ?? { label: tipo, bg: '#f1f5f9', color: '#475569' };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ContabilidadPage() {
  const ahora     = new Date();
  const [mes,  setMes]  = useState(ahora.getMonth() + 1);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [tab,  setTab]  = useState<'f07' | 'pac' | 'asientos'>('f07');
  const [detalle, setDetalle]   = useState<Asiento | null>(null);
  const [asPage,  setAsPage]    = useState(1);
  const [exportando, setExportando] = useState(false);
  const qc = useQueryClient();

  const params = `mes=${mes}&anio=${anio}`;

  // ── Empresa perfil ─────────────────────────────────────────────────────────
  const { data: empresa } = useQuery<EmpresaPerfil>({
    queryKey: ['empresa'],
    queryFn:  () => apiClient.get('/empresa').then(r => r.data),
    staleTime: 300_000,
  });

  // ── Queries ────────────────────────────────────────────────────────────────

  const qF07 = useQuery<ResumenF07>({
    queryKey: ['f07', mes, anio],
    queryFn:  () => apiClient.get(`/reportes/resumen?${params}`).then(r => r.data),
    enabled:  tab === 'f07',
  });

  const qPac = useQuery<PagoACuenta>({
    queryKey: ['pago-a-cuenta', mes, anio],
    queryFn:  () => apiClient.get(`/reportes/pago-a-cuenta?${params}`).then(r => r.data),
    enabled:  tab === 'pac',
    retry: 1,
  });

  const qResumen = useQuery<ResumenAsientos>({
    queryKey: ['asientos-resumen', mes, anio],
    queryFn:  () => apiClient.get(`/contabilidad/asientos/resumen?${params}`).then(r => r.data),
    enabled:  tab === 'asientos',
  });

  const qAsientos = useQuery<[Asiento[], number]>({
    queryKey: ['asientos', mes, anio, asPage],
    queryFn:  () => apiClient.get(`/contabilidad/asientos?${params}&page=${asPage}&limit=30`).then(r => r.data),
    enabled:  tab === 'asientos',
  });

  const generar = useMutation({
    mutationFn: () => apiClient.post('/contabilidad/asientos/generar', { mes, anio }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['asientos-resumen', mes, anio] });
      qc.invalidateQueries({ queryKey: ['asientos', mes, anio] });
    },
  });

  const regenerar = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/contabilidad/asientos/limpiar?mes=${mes}&anio=${anio}`);
      return apiClient.post('/contabilidad/asientos/generar', { mes, anio });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asientos-resumen', mes, anio] });
      qc.invalidateQueries({ queryKey: ['asientos', mes, anio] });
    },
  });

  const ocupado = generar.isPending || regenerar.isPending;

  // ── Print F-07 ─────────────────────────────────────────────────────────────
  const imprimirF07 = () => {
    if (!qF07.data) return;
    const d  = qF07.data;
    const emp = empresa;
    const ivaAPagar   = Number(d.f07.ivaPagar);
    const esRemanente = ivaAPagar < 0;

    const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>F-07 — ${MESES[mes-1]} ${anio}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff;padding:24px}
.wrap{max-width:760px;margin:0 auto}
/* Encabezado */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border:2px solid #1e3a8a;border-radius:6px;padding:12px 16px;margin-bottom:14px;background:#eff6ff}
.hdr-left h1{font-size:15px;font-weight:700;color:#1e3a8a;text-transform:uppercase}
.hdr-left p{font-size:10px;color:#475569;margin-top:3px}
.hdr-right{text-align:right;font-size:10px;color:#64748b}
.hdr-right strong{font-size:13px;color:#1e3a8a;display:block}
/* Datos contribuyente */
.datos{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;margin-bottom:14px}
.dato{padding:6px 10px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}
.dato:nth-child(even){border-right:none}
.dato.full{grid-column:1/-1;border-right:none}
.dato .lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px}
.dato .val{font-size:11px;font-weight:700;color:#0f172a}
/* Sección */
.sec{border:1px solid #cbd5e1;border-radius:6px;margin-bottom:12px;overflow:hidden}
.sec-hdr{background:#1e3a8a;color:#fff;font-weight:700;font-size:10px;padding:6px 12px;text-transform:uppercase;letter-spacing:.8px}
table{width:100%;border-collapse:collapse}
th{background:#f0f4ff;font-size:10px;font-weight:700;text-align:left;padding:5px 10px;border-bottom:1px solid #cbd5e1;color:#1e40af}
td{font-size:11px;padding:5px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.num{text-align:right}
.fw{font-weight:700}
.tot td{background:#dbeafe;font-weight:700;font-size:12px;border-top:2px solid #1e3a8a}
.neg{color:#dc2626}
.pos{color:#16a34a}
/* Liquidación */
.liq{border:2px solid #1e3a8a;border-radius:6px;overflow:hidden;margin-bottom:14px}
.liq-hdr{background:#1e3a8a;color:#fff;font-weight:700;font-size:10px;padding:6px 12px;text-transform:uppercase;letter-spacing:.8px}
.liq-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid #e2e8f0}
.liq-row:last-child{border-bottom:none}
.liq-lbl{font-size:12px;font-weight:600;color:#334155}
.liq-val{font-size:14px;font-weight:800}
.liq-result{background:${esRemanente?'#f0fdf4':'#fef2f2'};border-top:2px solid #000}
.liq-result .liq-lbl{font-size:13px;font-weight:700;color:${esRemanente?'#14532d':'#7f1d1d'}}
.liq-result .liq-val{font-size:22px;color:${esRemanente?'#16a34a':'#dc2626'}}
/* Firma */
.firma{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:24px}
.firma-box{text-align:center;padding-top:8px;border-top:1px solid #94a3b8;font-size:10px;color:#64748b}
/* Nota */
.nota{font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:12px;line-height:1.5}
@media print{body{padding:10px}}
</style></head><body>
<div class="wrap">

<div class="hdr">
  <div class="hdr-left">
    <h1>Declaración Mensual del IVA — F-07</h1>
    <p>Ministerio de Hacienda · República de El Salvador</p>
  </div>
  <div class="hdr-right">
    <strong>iFactu</strong>Sistema DTE El Salvador<br>Período: <strong>${MESES[mes-1]} ${anio}</strong>
  </div>
</div>

<div class="datos">
  <div class="dato full"><span class="lbl">Nombre / Razón Social</span><span class="val">${emp?.nombreLegal ?? '—'}</span></div>
  <div class="dato"><span class="lbl">NIT</span><span class="val">${emp?.nit ?? '—'}</span></div>
  <div class="dato"><span class="lbl">NRC</span><span class="val">${emp?.nrc ?? '—'}</span></div>
  <div class="dato"><span class="lbl">Actividad Económica</span><span class="val">${emp?.descActividad ?? '—'}</span></div>
  <div class="dato"><span class="lbl">Período</span><span class="val">${MESES[mes-1]} ${anio}</span></div>
  <div class="dato full"><span class="lbl">Dirección</span><span class="val">${[emp?.complemento, emp?.municipio, emp?.departamento].filter(Boolean).join(', ') || '—'}</span></div>
</div>

<div class="sec">
  <div class="sec-hdr">2. Débito Fiscal — Ventas del Período</div>
  <table>
    <thead><tr><th style="width:45%">Concepto</th><th class="num">Docs.</th><th class="num">Ventas Exentas</th><th class="num">Ventas Gravadas</th><th class="num">IVA 13%</th></tr></thead>
    <tbody>
      <tr><td>Ventas a Consumidores Finales (CF)</td><td class="num">${d.cf.cantidad}</td><td class="num">${Number(d.cf.exenta)>0?fmt(d.cf.exenta):'—'}</td><td class="num">${fmt(d.cf.gravada)}</td><td class="num fw neg">${fmt(d.cf.iva)}</td></tr>
      <tr><td>Ventas a Contribuyentes (CCF / NC / ND)</td><td class="num">${d.ccf.cantidad}</td><td class="num">${Number(d.ccf.exenta)>0?fmt(d.ccf.exenta):'—'}</td><td class="num">${fmt(d.ccf.gravada)}</td><td class="num fw neg">${fmt(d.ccf.iva)}</td></tr>
      ${Number(d.reten.cantidad)>0?`<tr><td>IVA Retenido (Comprobantes de Retención)</td><td class="num">${d.reten.cantidad}</td><td class="num">—</td><td class="num">—</td><td class="num fw neg">${fmt(d.reten.total)}</td></tr>`:''}
    </tbody>
    <tfoot><tr class="tot"><td colspan="2"><strong>Total Débito Fiscal</strong></td><td class="num">${fmt(Number(d.cf.exenta)+Number(d.ccf.exenta))}</td><td class="num">${fmt(Number(d.cf.gravada)+Number(d.ccf.gravada))}</td><td class="num neg">${fmt(d.f07.debitoFiscal)}</td></tr></tfoot>
  </table>
</div>

<div class="sec">
  <div class="sec-hdr">3. Crédito Fiscal — Compras del Período</div>
  <table>
    <thead><tr><th style="width:45%">Concepto</th><th class="num">Docs.</th><th class="num">Compras Exentas</th><th class="num">Compras Gravadas</th><th class="num">IVA Crédito</th></tr></thead>
    <tbody>
      <tr><td>Compras internas registradas</td><td class="num">${d.compras.cantidad}</td><td class="num">${Number(d.compras.compraExenta)>0?fmt(d.compras.compraExenta):'—'}</td><td class="num">${fmt(d.compras.compraGravada)}</td><td class="num fw pos">${fmt(d.compras.ivaCredito)}</td></tr>
    </tbody>
    <tfoot><tr class="tot"><td colspan="4"><strong>Total Crédito Fiscal</strong></td><td class="num pos">${fmt(d.f07.creditoFiscal)}</td></tr></tfoot>
  </table>
</div>

<div class="liq">
  <div class="liq-hdr">4. Liquidación del Impuesto</div>
  <div class="liq-row"><span class="liq-lbl">Débito Fiscal del período</span><span class="liq-val neg">${fmt(d.f07.debitoFiscal)}</span></div>
  <div class="liq-row"><span class="liq-lbl">Menos: Crédito Fiscal del período</span><span class="liq-val pos">(${fmt(d.f07.creditoFiscal)})</span></div>
  <div class="liq-row liq-result">
    <span class="liq-lbl">${esRemanente?'✅ Remanente de Crédito Fiscal (a favor)':'💳 IVA a pagar al Fisco'}</span>
    <span class="liq-val">${fmt(Math.abs(ivaAPagar))}</span>
  </div>
</div>

<div class="nota">
  Declaración preparada con el sistema iFactu DTE El Salvador. Los valores deben verificarse y declararse en el portal de Hacienda antes del último día hábil del mes siguiente al período declarado.<br>
  NIT: ${emp?.nit??'—'} | NRC: ${emp?.nrc??'—'} | Período: ${MESES[mes-1]} ${anio}
</div>

<div class="firma">
  <div class="firma-box">Firma del Contribuyente o Representante Legal</div>
  <div class="firma-box">Sello de la Empresa</div>
</div>

</div></body></html>`;

    const ventana = window.open('', '_blank', 'width=900,height=750');
    if (!ventana) return;
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
  };

  // ── Print F-14 ─────────────────────────────────────────────────────────────
  const imprimirPac = () => {
    if (!qPac.data) return;
    const d   = qPac.data;
    const emp = empresa;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>F-14 — ${MESES[mes-1]} ${anio}</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff;padding:24px}
.wrap{max-width:760px;margin:0 auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border:2px solid #7c3aed;border-radius:6px;padding:12px 16px;margin-bottom:14px;background:#f5f3ff}
.hdr-left h1{font-size:15px;font-weight:700;color:#7c3aed;text-transform:uppercase}
.hdr-left p{font-size:10px;color:#475569;margin-top:3px}
.hdr-right{text-align:right;font-size:10px;color:#64748b}.hdr-right strong{font-size:13px;color:#7c3aed;display:block}
.datos{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;margin-bottom:14px}
.dato{padding:6px 10px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0}.dato:nth-child(even){border-right:none}
.dato.full{grid-column:1/-1;border-right:none}
.dato .lbl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px}
.dato .val{font-size:11px;font-weight:700;color:#0f172a}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
.kpi{border-radius:8px;padding:14px 16px}.kpi .lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.kpi .val{font-size:22px;font-weight:900}.kpi.blue{background:#dbeafe;color:#1e40af}
.kpi.purple{background:#ede9fe;color:#7c3aed}.kpi.yellow{background:#fef3c7;color:#b45309}
.sec{border:1px solid #cbd5e1;border-radius:6px;margin-bottom:12px;overflow:hidden}
.sec-hdr{background:#7c3aed;color:#fff;font-weight:700;font-size:10px;padding:6px 12px;text-transform:uppercase;letter-spacing:.8px}
table{width:100%;border-collapse:collapse}
th{background:#f5f3ff;font-size:10px;font-weight:700;text-align:left;padding:5px 10px;border-bottom:1px solid #cbd5e1;color:#7c3aed}
td{font-size:11px;padding:5px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.num{text-align:right}.fw{font-weight:700}
.tot td{background:#ede9fe;font-weight:700;font-size:12px;border-top:2px solid #7c3aed}
.pac-result{background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:14px}
.pac-result .lbl{font-size:11px;color:#78350f;font-weight:700;text-transform:uppercase;margin-bottom:6px}
.pac-result .val{font-size:28px;font-weight:900;color:#b45309}
.guia{border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:12px 16px;font-size:10px;color:#78350f;margin-bottom:14px}
.guia strong{font-weight:700}.guia ol{padding-left:16px;margin-top:6px;line-height:1.8}
.firma{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:24px}
.firma-box{text-align:center;padding-top:8px;border-top:1px solid #94a3b8;font-size:10px;color:#64748b}
.nota{font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:12px;line-height:1.5}
@media print{body{padding:10px}}</style></head><body>
<div class="wrap">

<div class="hdr">
  <div class="hdr-left">
    <h1>Pago a Cuenta Anticipado del ISR — F-14</h1>
    <p>Ministerio de Hacienda · República de El Salvador</p>
  </div>
  <div class="hdr-right">
    <strong>iFactu</strong>Sistema DTE El Salvador<br>Período: <strong>${MESES[mes-1]} ${anio}</strong>
  </div>
</div>

<div class="datos">
  <div class="dato full"><span class="lbl">Nombre / Razón Social</span><span class="val">${emp?.nombreLegal ?? '—'}</span></div>
  <div class="dato"><span class="lbl">NIT</span><span class="val">${emp?.nit ?? '—'}</span></div>
  <div class="dato"><span class="lbl">NRC</span><span class="val">${emp?.nrc ?? '—'}</span></div>
  <div class="dato"><span class="lbl">Actividad Económica</span><span class="val">${emp?.descActividad ?? '—'}</span></div>
  <div class="dato"><span class="lbl">Período</span><span class="val">${MESES[mes-1]} ${anio}</span></div>
</div>

<div class="kpi-grid">
  <div class="kpi blue"><div class="lbl">Ingresos Brutos</div><div class="val">${fmt(d.ingresosBrutos)}</div></div>
  <div class="kpi purple"><div class="lbl">Tasa</div><div class="val">${d.tasa}%</div></div>
  <div class="kpi yellow"><div class="lbl">A Declarar F-14</div><div class="val">${fmt(d.pagoACuenta)}</div></div>
</div>

<div class="sec">
  <div class="sec-hdr">Desglose de Ingresos por Tipo de Documento</div>
  <table>
    <thead><tr><th style="width:10%">Tipo</th><th style="width:50%">Descripción</th><th class="num">Documentos</th><th class="num">Total</th></tr></thead>
    <tbody>
      ${d.porTipo.map(t => `<tr><td style="font-family:monospace;background:#f8fafc;padding:4px 8px">${t.tipoDte}</td><td>${t.nombre}</td><td class="num">${t.cantidad}</td><td class="num fw">${fmt(t.total)}</td></tr>`).join('')}
    </tbody>
    <tfoot><tr class="tot"><td colspan="3"><strong>Total Ingresos Brutos</strong></td><td class="num">${fmt(d.ingresosBrutos)}</td></tr></tfoot>
  </table>
</div>

<div class="pac-result">
  <div class="lbl">💼 Pago a Cuenta a Declarar en F-14 (${d.tasa}%)</div>
  <div class="val">${fmt(d.pagoACuenta)}</div>
</div>

<div class="guia">
  <strong>ℹ️ Pasos para declarar el F-14:</strong>
  <ol>
    <li>Ingresa al portal de Hacienda: <strong>admin.factura.gob.sv</strong></li>
    <li>Busca el formulario <strong>F-14 — Declaración y Pago a Cuenta</strong></li>
    <li>Ingresa los ingresos brutos: <strong>${fmt(d.ingresosBrutos)}</strong></li>
    <li>El sistema calculará el 1.75%: <strong>${fmt(d.pagoACuenta)}</strong></li>
    <li>Fecha límite: último día hábil del mes de ${MESES[mes % 12]} ${mes === 12 ? anio + 1 : anio}</li>
  </ol>
</div>

<div class="nota">
  Reporte preparado con iFactu DTE El Salvador. Los valores deben verificarse antes de declarar en Hacienda.<br>
  NIT: ${emp?.nit ?? '—'} | NRC: ${emp?.nrc ?? '—'} | Período: ${MESES[mes-1]} ${anio}
</div>

<div class="firma">
  <div class="firma-box">Firma del Contribuyente o Representante Legal</div>
  <div class="firma-box">Sello de la Empresa</div>
</div>

</div></body></html>`;

    const ventana = window.open('', '_blank', 'width=900,height=750');
    if (!ventana) return;
    ventana.document.write(html);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
  };

  // ── Print Libros Contables (Mayor + Diario) ────────────────────────────────
  const imprimirAsientos = async () => {
    if (!qResumen.data) return;
    setExportando(true);
    try {
      const resp = await apiClient.get(`/contabilidad/asientos?${params}&page=1&limit=2000`);
      const [todosAsientos]: [Asiento[], number] = resp.data;
      const r   = qResumen.data;
      const emp = empresa;

      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Libros Contables — ${MESES[mes-1]} ${anio}</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10px;color:#000;background:#fff;padding:20px}
.wrap{max-width:960px;margin:0 auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border:2px solid #0f172a;border-radius:6px;padding:12px 16px;margin-bottom:14px;background:#f8fafc}
.hdr-left h1{font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase}
.hdr-left p{font-size:9px;color:#475569;margin-top:3px}
.hdr-right{text-align:right;font-size:9px;color:#64748b}.hdr-right strong{font-size:12px;color:#0f172a;display:block}
.dato-row{display:flex;gap:24px;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:10px;color:#475569;margin-bottom:10px}
.dato-row span strong{color:#0f172a}
.sec{border:1px solid #cbd5e1;border-radius:6px;margin-bottom:14px;overflow:hidden}
.sec-hdr{background:#0f172a;color:#fff;font-weight:700;font-size:10px;padding:6px 12px;text-transform:uppercase;letter-spacing:.8px}
table{width:100%;border-collapse:collapse}
th{background:#f1f5f9;font-size:9px;font-weight:700;text-align:left;padding:4px 8px;border-bottom:1px solid #cbd5e1;color:#334155}
td{font-size:10px;padding:4px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.num{text-align:right}.fw{font-weight:700}
.tot td{background:#e2e8f0;font-weight:700;font-size:11px;border-top:2px solid #0f172a}
.pill{display:inline-block;font-size:8px;padding:1px 5px;border-radius:99px;font-weight:700}
.pill-v{background:#dbeafe;color:#1e40af}.pill-c{background:#dcfce7;color:#166534}.pill-m{background:#fef3c7;color:#92400e}
.nota{font-size:8px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:6px;margin-top:10px;line-height:1.5}
@media print{.sec{page-break-inside:avoid}}</style></head><body>
<div class="wrap">

<div class="hdr">
  <div class="hdr-left">
    <h1>📒 Libros Contables — ${MESES[mes-1]} ${anio}</h1>
    <p>Libro Mayor y Libro Diario · Sistema iFactu DTE El Salvador</p>
  </div>
  <div class="hdr-right">
    <strong>${emp?.nombreLegal ?? ''}</strong>
    NIT: ${emp?.nit ?? '—'} | NRC: ${emp?.nrc ?? '—'}<br>
    ${todosAsientos.length} asientos · Balance: ${Math.abs(Number(r.totalDebe) - Number(r.totalHaber)) < 0.01 ? '✓ Cuadrado' : '⚠ Descuadrado'}
  </div>
</div>

<div class="sec">
  <div class="sec-hdr">📊 Libro Mayor — Saldos por Cuenta</div>
  <table>
    <thead>
      <tr><th style="width:10%">Código</th><th style="width:45%">Cuenta</th><th class="num">Debe</th><th class="num">Haber</th><th class="num">Saldo</th></tr>
    </thead>
    <tbody>
      ${r.libroDiario.map(c => `
      <tr>
        <td style="font-family:monospace;color:#64748b">${c.codigo}</td>
        <td>${c.nombre}</td>
        <td class="num">${c.debe > 0 ? fmt(c.debe) : '—'}</td>
        <td class="num">${c.haber > 0 ? fmt(c.haber) : '—'}</td>
        <td class="num fw" style="color:${c.saldo > 0.005 ? '#1e40af' : c.saldo < -0.005 ? '#dc2626' : '#16a34a'}">${Math.abs(c.saldo) < 0.005 ? '—' : c.saldo < 0 ? `(${fmt(Math.abs(c.saldo))})` : fmt(c.saldo)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr class="tot">
        <td colspan="2"><strong>TOTALES</strong></td>
        <td class="num">${fmt(r.totalDebe)}</td>
        <td class="num">${fmt(r.totalHaber)}</td>
        <td class="num" style="color:${Math.abs(Number(r.totalDebe)-Number(r.totalHaber))<0.01?'#16a34a':'#dc2626'}">${Math.abs(Number(r.totalDebe)-Number(r.totalHaber))<0.01?'✓ Cuadrado':fmt(Math.abs(Number(r.totalDebe)-Number(r.totalHaber)))}</td>
      </tr>
    </tfoot>
  </table>
</div>

<div class="sec">
  <div class="sec-hdr">📒 Libro Diario — ${todosAsientos.length} Asientos</div>
  <table>
    <thead>
      <tr><th style="width:9%">Fecha</th><th>Descripción</th><th style="width:8%">Tipo</th><th class="num" style="width:11%">Debe</th><th class="num" style="width:11%">Haber</th></tr>
    </thead>
    <tbody>
      ${todosAsientos.map(a => `
      <tr>
        <td style="white-space:nowrap">${a.fecha}</td>
        <td>${a.descripcion}</td>
        <td><span class="pill ${a.tipo==='DTE_VENTA'?'pill-v':a.tipo==='COMPRA'?'pill-c':'pill-m'}">${a.tipo==='DTE_VENTA'?'Venta':a.tipo==='COMPRA'?'Compra':'Manual'}</span></td>
        <td class="num">${fmt(a.totalDebe)}</td>
        <td class="num">${fmt(a.totalHaber)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr class="tot">
        <td colspan="3"><strong>TOTALES</strong></td>
        <td class="num">${fmt(r.totalDebe)}</td>
        <td class="num">${fmt(r.totalHaber)}</td>
      </tr>
    </tfoot>
  </table>
</div>

<div class="nota">
  Libros generados con iFactu DTE El Salvador · ${new Date().toLocaleDateString('es-SV')} · NIT: ${emp?.nit ?? '—'} | NRC: ${emp?.nrc ?? '—'}
</div>

</div></body></html>`;

      const ventana = window.open('', '_blank', 'width=1000,height=800');
      if (!ventana) return;
      ventana.document.write(html);
      ventana.document.close();
      setTimeout(() => ventana.print(), 500);
    } finally {
      setExportando(false);
    }
  };

  // ── Exportar asientos CSV ──────────────────────────────────────────────────
  const exportarAsientosCSV = async () => {
    setExportando(true);
    try {
      const resp = await apiClient.get(`/contabilidad/asientos?${params}&page=1&limit=2000`);
      const [todosAsientos]: [Asiento[], number] = resp.data;

      const filas: string[][] = [
        ['Fecha','Descripción','Tipo','Total Debe','Total Haber','Código Cuenta','Nombre Cuenta','Debe Línea','Haber Línea'],
      ];
      for (const a of todosAsientos) {
        if (a.lineas.length === 0) {
          filas.push([a.fecha, a.descripcion, a.tipo, String(a.totalDebe), String(a.totalHaber), '', '', '', '']);
        } else {
          a.lineas.forEach((l, i) => {
            filas.push([
              i === 0 ? a.fecha        : '',
              i === 0 ? a.descripcion  : '',
              i === 0 ? a.tipo         : '',
              i === 0 ? String(a.totalDebe)  : '',
              i === 0 ? String(a.totalHaber) : '',
              l.cuenta,
              l.nombreCuenta,
              String(l.debe),
              String(l.haber),
            ]);
          });
        }
      }

      const csv  = filas.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `asientos_${MESES[mes-1].toLowerCase()}_${anio}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  };

  // ── Tab: F-07 ─────────────────────────────────────────────────────────────
  const TabF07 = () => {
    const d = qF07.data;
    if (qF07.isLoading) return <Spinner texto="Cargando declaración..." />;
    if (qF07.isError)   return <ErrorBox />;
    if (!d) return null;

    const ivaAPagar   = Number(d.f07.ivaPagar);
    const esRemanente = ivaAPagar < 0;

    // Fila de tabla helper
    const TR = ({ label, docs, exenta, gravada, iva, bold }: { label: string; docs?: number; exenta?: number; gravada?: number; iva?: number; bold?: boolean }) => (
      <tr style={bold ? { background: 'rgba(59,130,246,0.18)', fontWeight: 700, borderTop: '2px solid rgba(59,130,246,0.4)' } : {}}>
        <td style={{ fontSize: 13, fontWeight: bold ? 700 : 400, color: bold ? 'var(--text-main)' : undefined }}>{label}</td>
        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{docs != null ? docs : ''}</td>
        <td style={{ textAlign: 'right', fontSize: 12, color: bold ? 'var(--text-main)' : undefined }}>{exenta != null && exenta > 0 ? fmt(exenta) : '—'}</td>
        <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: bold ? 'var(--text-main)' : undefined }}>{gravada != null ? fmt(gravada) : '—'}</td>
        <td style={{ textAlign: 'right', fontSize: 13, fontWeight: bold ? 800 : 600, color: bold ? '#f87171' : undefined }}>{iva != null ? fmt(iva) : '—'}</td>
      </tr>
    );

    return (
      <>
        {/* KPIs */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          {[
            { icon: '🧾', label: 'Facturas CF',      value: String(d.cf.cantidad),              color: 'blue'   },
            { icon: '📄', label: 'CCF / NC / ND',    value: String(d.ccf.cantidad),             color: 'blue'   },
            { icon: '💰', label: 'Ventas Netas CF',  value: fmt(d.cf.gravada),                  color: 'green'  },
            { icon: '💰', label: 'Ventas Netas CCF', value: fmt(d.ccf.gravada),                 color: 'green'  },
            { icon: '📈', label: 'Débito Fiscal',    value: fmt(d.f07.debitoFiscal),            color: 'red'    },
            { icon: '📉', label: 'Crédito Fiscal',   value: fmt(d.f07.creditoFiscal),           color: 'yellow' },
          ].map(k => (
            <div key={k.label} className="stat-card">
              <div className={`stat-icon ${k.color}`}>{k.icon}</div>
              <div className="stat-info">
                <div className="stat-value">{k.value}</div>
                <div className="stat-label">{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Botón imprimir */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={imprimirF07}>
            🖨️ Imprimir / Exportar F-07
          </button>
        </div>

        {/* Datos del contribuyente */}
        <div className="table-card" style={{ marginBottom: 16 }}>
          <div className="table-header" style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📊 Declaración IVA — F-07 · {d.nombreMes} {d.anio}</span>
            <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>Ministerio de Hacienda · El Salvador</span>
          </div>
          <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
            {[
              { label: 'Nombre / Razón Social', value: empresa?.nombreLegal ?? '—', full: true },
              { label: 'NIT', value: empresa?.nit ?? '—' },
              { label: 'NRC', value: empresa?.nrc ?? '—' },
              { label: 'Actividad Económica', value: empresa?.descActividad ?? '—' },
              { label: 'Período', value: `${MESES[mes-1]} ${anio}` },
              { label: 'Dirección', value: [empresa?.complemento, empresa?.municipio, empresa?.departamento].filter(Boolean).join(', ') || '—', full: true },
            ].map(f => (
              <div key={f.label} style={f.full ? { gridColumn: '1 / -1' } : {}}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Débito Fiscal */}
        <div className="table-card" style={{ marginBottom: 14 }}>
          <div className="table-header">
            <span className="table-title">2. Débito Fiscal — Ventas del Período</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '42%' }}>Concepto</th>
                <th style={{ textAlign: 'center' }}>Docs.</th>
                <th style={{ textAlign: 'right' }}>Ventas Exentas</th>
                <th style={{ textAlign: 'right' }}>Ventas Gravadas</th>
                <th style={{ textAlign: 'right' }}>IVA 13%</th>
              </tr>
            </thead>
            <tbody>
              <TR label="Ventas a Consumidores Finales (CF)" docs={d.cf.cantidad}  exenta={d.cf.exenta}  gravada={d.cf.gravada}  iva={d.cf.iva}  />
              <TR label="Ventas a Contribuyentes (CCF/NC/ND)" docs={d.ccf.cantidad} exenta={d.ccf.exenta} gravada={d.ccf.gravada} iva={d.ccf.iva} />
              {d.reten.cantidad > 0 && <TR label={`IVA Retenido (${d.reten.cantidad} CR)`} iva={d.reten.total} />}
              <TR label="Total Débito Fiscal" exenta={Number(d.cf.exenta)+Number(d.ccf.exenta)} gravada={Number(d.cf.gravada)+Number(d.ccf.gravada)} iva={d.f07.debitoFiscal} bold />
            </tbody>
          </table>
        </div>

        {/* Crédito Fiscal */}
        <div className="table-card" style={{ marginBottom: 14 }}>
          <div className="table-header">
            <span className="table-title">3. Crédito Fiscal — Compras del Período</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '42%' }}>Concepto</th>
                <th style={{ textAlign: 'center' }}>Docs.</th>
                <th style={{ textAlign: 'right' }}>Compras Exentas</th>
                <th style={{ textAlign: 'right' }}>Compras Gravadas</th>
                <th style={{ textAlign: 'right' }}>IVA Crédito</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compras internas registradas</td>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{d.compras.cantidad}</td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>{Number(d.compras.compraExenta) > 0 ? fmt(d.compras.compraExenta) : '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{fmt(d.compras.compraGravada)}</td>
                <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#16a34a' }}>{fmt(d.compras.ivaCredito)}</td>
              </tr>
              <tr style={{ background: 'rgba(34,197,94,0.18)', fontWeight: 700, borderTop: '2px solid rgba(34,197,94,0.4)' }}>
                <td colSpan={4} style={{ fontWeight: 700, color: 'var(--text-main)' }}>Total Crédito Fiscal</td>
                <td style={{ textAlign: 'right', color: '#4ade80', fontWeight: 800 }}>{fmt(d.f07.creditoFiscal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Liquidación */}
        <div style={{
          border: `2px solid ${esRemanente ? '#16a34a' : '#dc2626'}`,
          borderRadius: 12, overflow: 'hidden', maxWidth: 560,
        }}>
          <div style={{ background: '#1e3a8a', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 16px', textTransform: 'uppercase', letterSpacing: .8 }}>
            4. Liquidación del Impuesto
          </div>
          {[
            { label: 'Débito Fiscal del período',       value: fmt(d.f07.debitoFiscal),   color: '#dc2626' },
            { label: 'Menos: Crédito Fiscal del período', value: `(${fmt(d.f07.creditoFiscal)})`, color: '#16a34a' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: row.color }}>{row.value}</span>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 18px',
            background: esRemanente ? '#f0fdf4' : '#fef2f2',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: esRemanente ? '#14532d' : '#7f1d1d' }}>
              {esRemanente ? '✅ Remanente de Crédito Fiscal (a favor)' : '💳 IVA a pagar al Fisco'}
            </span>
            <span style={{ fontSize: 28, fontWeight: 900, color: esRemanente ? '#16a34a' : '#dc2626' }}>
              {fmt(Math.abs(ivaAPagar))}
            </span>
          </div>
        </div>
      </>
    );
  };

  // ── Tab: Pago a Cuenta F-14 ───────────────────────────────────────────────
  const TabPac = () => {
    if (qPac.isLoading) return <Spinner texto="Calculando pago a cuenta..." />;
    if (qPac.isError)   return <ErrorBox />;
    const d = qPac.data;
    if (!d) return <Spinner texto="Cargando..." />;

    return (
      <>
        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'Ingresos Brutos del Mes',   value: fmt(d.ingresosBrutos), bg: '#dbeafe', fg: '#1e40af', desc: 'Total ventas todos los tipos' },
            { label: 'Tasa Pago a Cuenta',         value: `${d.tasa}%`,          bg: '#ede9fe', fg: '#7c3aed', desc: 'Porcentaje anticipo ISR' },
            { label: 'A Declarar en F-14',         value: fmt(d.pagoACuenta),    bg: '#fef3c7', fg: '#b45309', desc: 'Ingresos × 1.75%' },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: '20px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: k.fg, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: k.fg }}>{k.value}</div>
              <div style={{ fontSize: 11, color: k.fg, opacity: .7, marginTop: 4 }}>{k.desc}</div>
            </div>
          ))}
        </div>

        {/* Botón imprimir */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={imprimirPac}>
            🖨️ Imprimir / Exportar F-14
          </button>
        </div>

        {/* Desglose */}
        <div className="table-card" style={{ marginBottom: 16 }}>
          <div className="table-header">
            <span className="table-title">💼 Desglose de ingresos — {d.nombreMes} {d.anio}</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'center' }}>Documentos</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.porTipo.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Sin ingresos en este período</td></tr>
              ) : d.porTipo.map(t => (
                <tr key={t.tipoDte}>
                  <td><span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{t.tipoDte}</span></td>
                  <td>{t.nombre}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t.cantidad}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(t.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                <td colSpan={3} style={{ textAlign: 'right' }}>Total Ingresos Brutos</td>
                <td style={{ textAlign: 'right' }}>{fmt(d.ingresosBrutos)}</td>
              </tr>
              <tr style={{ fontWeight: 800, background: '#fef3c7' }}>
                <td colSpan={3} style={{ textAlign: 'right', color: '#b45309' }}>Pago a Cuenta ({d.tasa}%)</td>
                <td style={{ textAlign: 'right', color: '#b45309', fontSize: 16 }}>{fmt(d.pagoACuenta)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Guía */}
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#78350f' }}>
          <strong>ℹ️ Cómo declarar el Pago a Cuenta F-14:</strong>
          <ol style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Ingresa al portal de Hacienda: <strong>admin.factura.gob.sv</strong></li>
            <li>Busca el formulario <strong>F-14 — Declaración y Pago a Cuenta</strong></li>
            <li>Ingresa los ingresos brutos del mes: <strong>{fmt(d.ingresosBrutos)}</strong></li>
            <li>El sistema calculará automáticamente el 1.75%: <strong>{fmt(d.pagoACuenta)}</strong></li>
            <li>Fecha límite: último día hábil del mes de {MESES[(mes % 12)]} {mes === 12 ? anio + 1 : anio}</li>
          </ol>
        </div>
      </>
    );
  };

  // ── Tab: Asientos Contables ───────────────────────────────────────────────
  const TabAsientos = () => {
    const resumen          = qResumen.data;
    const [asientos, total] = qAsientos.data ?? [[], 0];
    const totalPaginas      = Math.ceil(total / 30);

    return (
      <>
        {/* Acciones */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={() => generar.mutate()}
                disabled={ocupado}
              >
                {generar.isPending ? '⏳ Generando...' : '⚡ Generar asientos'}
              </button>
              <button
                className="btn"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                onClick={() => { if (window.confirm(`¿Borrar y regenerar todos los asientos de ${MESES[mes-1]} ${anio}? Los asientos actuales se eliminarán.`)) regenerar.mutate(); }}
                disabled={ocupado}
                title="Borra los asientos del mes y los recrea desde cero (útil tras corregir datos)"
              >
                {regenerar.isPending ? '⏳ Regenerando...' : '🔄 Limpiar y regenerar'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              <strong>Generar</strong>: agrega los que faltan · <strong>Limpiar y regenerar</strong>: borra todo y recrea
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignSelf: 'center' }}>
            <button
              className="btn"
              onClick={imprimirAsientos}
              disabled={!qResumen.data || exportando}
              title="Imprime Libro Mayor + Libro Diario"
            >
              {exportando ? '⏳ Exportando...' : '🖨️ Imprimir libros'}
            </button>
            <button
              className="btn"
              onClick={exportarAsientosCSV}
              disabled={exportando}
              title="Descarga todos los asientos del mes en formato CSV"
            >
              {exportando ? '⏳...' : '📥 Exportar CSV'}
            </button>
          </div>
          {(generar.isSuccess || regenerar.isSuccess) && (
            <div style={{ fontSize: 13, color: '#16a34a', background: 'rgba(22,163,74,0.1)', padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(22,163,74,0.3)' }}>
              ✅ {((generar.data ?? regenerar.data) as any)?.data?.generados} asientos generados
              {generar.isSuccess && ` · ${(generar.data as any).data.omitidos} ya existían`}
            </div>
          )}
          {(generar.isError || regenerar.isError) && (
            <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)' }}>
              ❌ Error al generar asientos. Revisa los logs del backend.
            </div>
          )}
        </div>

        {(qResumen.isLoading || qAsientos.isLoading) && <Spinner texto="Cargando asientos..." />}

        {/* Métricas */}
        {resumen && (
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            {[
              { icon: '📒', label: 'Asientos',     value: String(resumen.cantidad),   color: 'blue'   },
              { icon: '⬆️', label: 'Total Debe',   value: fmt(resumen.totalDebe),     color: 'red'    },
              { icon: '⬇️', label: 'Total Haber',  value: fmt(resumen.totalHaber),    color: 'green'  },
              {
                icon: '⚖️',
                label: 'Balance',
                value: Math.abs(Number(resumen.totalDebe) - Number(resumen.totalHaber)) < 0.01 ? '✓ Cuadrado' : '⚠️ Descuadrado',
                color: Math.abs(Number(resumen.totalDebe) - Number(resumen.totalHaber)) < 0.01 ? 'green' : 'red',
              },
            ].map(k => (
              <div key={k.label} className="stat-card">
                <div className={`stat-icon ${k.color}`}>{k.icon}</div>
                <div className="stat-info">
                  <div className="stat-value" style={{ fontSize: 16 }}>{k.value}</div>
                  <div className="stat-label">{k.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Libro Mayor */}
        {resumen && resumen.libroDiario.length > 0 && (
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header">
              <span className="table-title">📊 Libro Mayor — {MESES[mes-1]} {anio}</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th><th>Cuenta</th>
                  <th style={{ textAlign: 'right' }}>Debe</th>
                  <th style={{ textAlign: 'right' }}>Haber</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {resumen.libroDiario.map(c => (
                  <tr key={c.codigo}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.codigo}</td>
                    <td>{c.nombre}</td>
                    <td style={{ textAlign: 'right' }}>{c.debe > 0 ? fmt(c.debe) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{c.haber > 0 ? fmt(c.haber) : '—'}</td>
                    <td style={{
                      textAlign: 'right', fontWeight: 700,
                      color: c.saldo > 0.005 ? '#1e40af' : c.saldo < -0.005 ? '#dc2626' : '#16a34a',
                    }}>
                      {Math.abs(c.saldo) < 0.005 ? '—' : (c.saldo < 0 ? `(${fmt(Math.abs(c.saldo))})` : fmt(c.saldo))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                  <td colSpan={2} style={{ textAlign: 'right' }}>Totales</td>
                  <td style={{ textAlign: 'right' }}>{fmt(resumen.totalDebe)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(resumen.totalHaber)}</td>
                  <td style={{ textAlign: 'right', color: Math.abs(Number(resumen.totalDebe) - Number(resumen.totalHaber)) < 0.01 ? '#16a34a' : '#dc2626' }}>
                    {Math.abs(Number(resumen.totalDebe) - Number(resumen.totalHaber)) < 0.01 ? '✓ Cuadrado' : fmt(Math.abs(Number(resumen.totalDebe) - Number(resumen.totalHaber)))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Libro Diario */}
        {asientos.length > 0 && (
          <div className="table-card">
            <div className="table-header">
              <span className="table-title">📒 Libro Diario — {total} asientos</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Descripción</th><th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Debe</th>
                  <th style={{ textAlign: 'right' }}>Haber</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {asientos.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(a)}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{a.fecha}</td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{a.descripcion}</td>
                    <td><PillTipo tipo={a.tipo} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(a.totalDebe)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(a.totalHaber)}</td>
                    <td style={{ color: '#3b82f6', fontSize: 12, cursor: 'pointer' }}>ver →</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPaginas > 1 && (
              <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                <button className="btn btn-sm" disabled={asPage === 1} onClick={() => setAsPage(p => p - 1)}>← Ant</button>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Página {asPage} de {totalPaginas}</span>
                <button className="btn btn-sm" disabled={asPage >= totalPaginas} onClick={() => setAsPage(p => p + 1)}>Sig →</button>
              </div>
            )}
          </div>
        )}

        {!qAsientos.isLoading && asientos.length === 0 && !generar.isPending && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📒</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Sin asientos en este período</div>
            <div style={{ fontSize: 13 }}>Haz clic en <strong>Generar asientos del mes</strong> para crearlos automáticamente desde los DTEs emitidos y las compras registradas.</div>
          </div>
        )}
      </>
    );
  };

  // ── Modal detalle asiento ─────────────────────────────────────────────────
  const ModalDetalle = () => {
    if (!detalle) return null;
    const balanceado = Math.abs(detalle.totalDebe - detalle.totalHaber) < 0.01;
    return (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={() => setDetalle(null)}
      >
        <div
          style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '28px 32px', maxWidth: 600, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Encabezado */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Asiento Contable</span>
                <PillTipo tipo={detalle.tipo} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detalle.fecha}</div>
            </div>
            <button
              onClick={() => setDetalle(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1, padding: 4 }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)', background: 'var(--bg-subtle)', padding: '10px 14px', borderRadius: 8, marginBottom: 20, lineHeight: 1.4 }}>
            {detalle.descripcion}
          </div>

          {/* Tabla de líneas */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th style={{ width: 52, padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Cód.</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Cuenta</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Debe</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Haber</th>
              </tr>
            </thead>
            <tbody>
              {detalle.lineas.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{l.cuenta}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{l.nombreCuenta}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: l.debe > 0 ? '#60a5fa' : 'var(--text-muted)', fontWeight: l.debe > 0 ? 700 : 400, fontSize: 13 }}>
                    {l.debe > 0 ? fmt(l.debe) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: l.haber > 0 ? '#4ade80' : 'var(--text-muted)', fontWeight: l.haber > 0 ? 700 : 400, fontSize: 13 }}>
                    {l.haber > 0 ? fmt(l.haber) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-subtle)', borderTop: '2px solid var(--border-color)' }}>
                <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>Totales</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#60a5fa' }}>{fmt(detalle.totalDebe)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: '#4ade80' }}>{fmt(detalle.totalHaber)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Badge de balance */}
          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <span style={{
              display: 'inline-block', fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 700,
              background: balanceado ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
              color: balanceado ? '#4ade80' : '#f87171',
              border: `1px solid ${balanceado ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'}`,
            }}>
              {balanceado ? '✓ Cuadrado' : `⚠ Diferencia: ${fmt(Math.abs(detalle.totalDebe - detalle.totalHaber))}`}
            </span>
          </div>

          <button className="btn" style={{ width: '100%' }} onClick={() => setDetalle(null)}>Cerrar</button>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">🏦 Contabilidad</span>
      </div>

      <div style={{ padding: '20px 28px', flex: 1, overflowY: 'auto' }}>

        {/* Selector período */}
        <div className="table-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
              <label className="form-label">Mes</label>
              <select className="form-control" value={mes} onChange={e => { setMes(Number(e.target.value)); setAsPage(1); }}>
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 90, marginBottom: 0 }}>
              <label className="form-label">Año</label>
              <input className="form-control" type="number" value={anio}
                onChange={e => { setAnio(Number(e.target.value)); setAsPage(1); }} min={2020} max={2099} />
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', paddingBottom: 4 }}>
              Período seleccionado: <strong>{MESES[mes-1]} {anio}</strong>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border-color)' }}>
          {([
            { id: 'f07',      label: '📊 Declaración IVA (F-07)' },
            { id: 'pac',      label: '💼 Pago a Cuenta (F-14)'   },
            { id: 'asientos', label: '📒 Asientos Contables'      },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 18px', fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2, transition: 'all .15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'f07'      && <TabF07 />}
        {tab === 'pac'      && <TabPac />}
        {tab === 'asientos' && <TabAsientos />}
      </div>

      <ModalDetalle />
    </div>
  );
}

// ── Aux ───────────────────────────────────────────────────────────────────────

function Spinner({ texto }: { texto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 0', color: 'var(--text-muted)' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      {texto}
    </div>
  );
}

function ErrorBox() {
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '16px 20px', color: '#dc2626', fontSize: 14 }}>
      ❌ Error al cargar los datos. Verifica que el backend esté activo y vuelve a intentarlo.
    </div>
  );
}
