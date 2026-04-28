import { useState, useRef } from 'react';
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
  const printRef = useRef<HTMLDivElement>(null);
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

  // ── Print F-07 ─────────────────────────────────────────────────────────────
  const imprimirF07 = () => {
    const contenido = printRef.current?.innerHTML;
    if (!contenido) return;
    const ventana = window.open('', '_blank', 'width=900,height=700');
    if (!ventana) return;
    ventana.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8">
      <title>Declaración IVA F-07 — ${MESES[mes-1]} ${anio}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 20px; }
        .f07-wrap { max-width: 780px; margin: 0 auto; }
        .f07-header { border: 2px solid #000; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
        .f07-title { font-size: 14px; font-weight: 700; text-transform: uppercase; }
        .f07-subtitle { font-size: 11px; color: #333; margin-top: 2px; }
        .f07-logo { text-align: right; font-size: 10px; color: #555; }
        .f07-datos { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; margin-bottom: 12px; }
        .f07-campo { padding: 5px 8px; border-right: 1px solid #aaa; border-bottom: 1px solid #aaa; }
        .f07-campo:nth-child(even) { border-right: none; }
        .f07-campo label { font-size: 9px; color: #555; text-transform: uppercase; display: block; }
        .f07-campo span { font-size: 11px; font-weight: 600; }
        .seccion { border: 1px solid #000; margin-bottom: 10px; }
        .seccion-title { background: #2563eb; color: #fff; font-weight: 700; font-size: 11px; padding: 5px 10px; text-transform: uppercase; letter-spacing: .5px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #e8f0fe; font-size: 10px; text-align: left; padding: 4px 8px; border-bottom: 1px solid #aaa; }
        td { font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
        .num { text-align: right; font-weight: 600; }
        .tot-row td { background: #f0f4ff; font-weight: 700; border-top: 2px solid #2563eb; }
        .liq { border: 2px solid #000; margin-bottom: 12px; }
        .liq-row { display: flex; justify-content: space-between; padding: 7px 14px; border-bottom: 1px solid #ccc; font-size: 12px; }
        .liq-row:last-child { border-bottom: none; }
        .liq-label { font-weight: 600; }
        .liq-val { font-weight: 700; font-size: 14px; }
        .pagar { background: #fef2f2; }
        .favor { background: #f0fdf4; }
        .pagar .liq-val { color: #dc2626; }
        .favor .liq-val { color: #16a34a; }
        .firma { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
        .firma-box { border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 10px; color: #555; }
        @media print { body { padding: 10px; } }
      </style>
    </head><body>${contenido}</body></html>`);
    ventana.document.close();
    setTimeout(() => { ventana.print(); }, 400);
  };

  // ── Tab: F-07 ─────────────────────────────────────────────────────────────
  const TabF07 = () => {
    const d = qF07.data;
    if (qF07.isLoading) return <Spinner texto="Cargando declaración..." />;
    if (qF07.isError)   return <ErrorBox />;
    if (!d) return null;

    const ivaAPagar = Number(d.f07.ivaPagar);
    const esRemanente = ivaAPagar < 0;

    return (
      <>
        {/* KPIs */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          {[
            { icon: '🧾', label: 'Facturas CF',      value: String(d.cf.cantidad),              color: 'blue'   },
            { icon: '📄', label: 'CCF / NC / ND',    value: String(d.ccf.cantidad),             color: 'blue'   },
            { icon: '💰', label: 'Ventas Netas CF',  value: fmt(d.cf.gravada + d.cf.exenta),   color: 'green'  },
            { icon: '💰', label: 'Ventas Netas CCF', value: fmt(d.ccf.gravada + d.ccf.exenta), color: 'green'  },
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={imprimirF07}>
            🖨️ Imprimir / Exportar F-07
          </button>
        </div>

        {/* ── Contenido imprimible ─────────────────────────────────────── */}
        <div ref={printRef}>
          <div className="f07-wrap">

            {/* Encabezado */}
            <div className="f07-header">
              <div>
                <div className="f07-title">📊 Declaración Mensual del IVA — Formulario F-07</div>
                <div className="f07-subtitle">Ministerio de Hacienda · El Salvador</div>
              </div>
              <div className="f07-logo">
                <div style={{ fontWeight: 700, fontSize: 13 }}>iFactu</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Sistema DTE El Salvador</div>
              </div>
            </div>

            {/* Datos del contribuyente */}
            <div className="seccion" style={{ marginBottom: 12 }}>
              <div className="seccion-title">1. Datos del Contribuyente</div>
              <div className="f07-datos">
                <div className="f07-campo" style={{ gridColumn: '1 / -1' }}>
                  <label>Nombre / Razón Social</label>
                  <span>{empresa?.nombreLegal ?? '—'}</span>
                </div>
                <div className="f07-campo"><label>NIT</label><span>{empresa?.nit ?? '—'}</span></div>
                <div className="f07-campo"><label>NRC</label><span>{empresa?.nrc ?? '—'}</span></div>
                <div className="f07-campo"><label>Actividad Económica</label><span>{empresa?.descActividad ?? '—'}</span></div>
                <div className="f07-campo"><label>Período</label><span>{MESES[mes-1]} {anio}</span></div>
                <div className="f07-campo" style={{ gridColumn: '1 / -1' }}>
                  <label>Dirección</label>
                  <span>{[empresa?.complemento, empresa?.municipio, empresa?.departamento].filter(Boolean).join(', ') || '—'}</span>
                </div>
              </div>
            </div>

            {/* Sección Débito Fiscal */}
            <div className="seccion">
              <div className="seccion-title">2. Débito Fiscal — Ventas del Período</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '50%' }}>Concepto</th>
                    <th style={{ textAlign: 'right' }}>Docs.</th>
                    <th style={{ textAlign: 'right' }}>Ventas Exentas</th>
                    <th style={{ textAlign: 'right' }}>Ventas Gravadas (neto)</th>
                    <th style={{ textAlign: 'right' }}>IVA 13%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Ventas a Consumidores Finales (F-CF)</td>
                    <td className="num">{d.cf.cantidad}</td>
                    <td className="num">{d.cf.exenta > 0 ? fmt(d.cf.exenta) : '—'}</td>
                    <td className="num">{fmt(d.cf.gravada)}</td>
                    <td className="num" style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(d.cf.iva)}</td>
                  </tr>
                  <tr>
                    <td>Ventas a Contribuyentes (CCF / NC / ND)</td>
                    <td className="num">{d.ccf.cantidad}</td>
                    <td className="num">{d.ccf.exenta > 0 ? fmt(d.ccf.exenta) : '—'}</td>
                    <td className="num">{fmt(d.ccf.gravada)}</td>
                    <td className="num" style={{ color: '#dc2626', fontWeight: 700 }}>{fmt(d.ccf.iva)}</td>
                  </tr>
                  {d.reten.cantidad > 0 && (
                    <tr>
                      <td>IVA Retenido (Comprobantes de Retención)</td>
                      <td className="num">{d.reten.cantidad}</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                      <td className="num">{fmt(d.reten.total)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="tot-row">
                    <td colSpan={2}><strong>Total Débito Fiscal</strong></td>
                    <td className="num">{fmt(Number(d.cf.exenta) + Number(d.ccf.exenta))}</td>
                    <td className="num">{fmt(Number(d.cf.gravada) + Number(d.ccf.gravada))}</td>
                    <td className="num" style={{ color: '#dc2626' }}>{fmt(d.f07.debitoFiscal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Sección Crédito Fiscal */}
            <div className="seccion" style={{ marginTop: 10 }}>
              <div className="seccion-title">3. Crédito Fiscal — Compras del Período</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '50%' }}>Concepto</th>
                    <th style={{ textAlign: 'right' }}>Docs.</th>
                    <th style={{ textAlign: 'right' }}>Compras Exentas</th>
                    <th style={{ textAlign: 'right' }}>Compras Gravadas (neto)</th>
                    <th style={{ textAlign: 'right' }}>IVA Crédito</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Compras internas registradas</td>
                    <td className="num">{d.compras.cantidad}</td>
                    <td className="num">{(d.compras as any).compraExenta > 0 ? fmt((d.compras as any).compraExenta) : '—'}</td>
                    <td className="num">{fmt(d.compras.compraGravada)}</td>
                    <td className="num" style={{ color: '#16a34a', fontWeight: 700 }}>{fmt(d.compras.ivaCredito)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="tot-row">
                    <td colSpan={4}><strong>Total Crédito Fiscal</strong></td>
                    <td className="num" style={{ color: '#16a34a' }}>{fmt(d.f07.creditoFiscal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Liquidación */}
            <div className="liq" style={{ marginTop: 10 }}>
              <div style={{ background: '#1e3a8a', color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 10px', textTransform: 'uppercase', letterSpacing: .5 }}>
                4. Liquidación del Impuesto
              </div>
              <div className="liq-row">
                <span className="liq-label">Débito Fiscal del período</span>
                <span className="liq-val" style={{ color: '#dc2626' }}>{fmt(d.f07.debitoFiscal)}</span>
              </div>
              <div className="liq-row">
                <span className="liq-label">Menos: Crédito Fiscal del período</span>
                <span className="liq-val" style={{ color: '#16a34a' }}>({fmt(d.f07.creditoFiscal)})</span>
              </div>
              <div className={`liq-row ${esRemanente ? 'favor' : 'pagar'}`} style={{ borderTop: '2px solid #000' }}>
                <span className="liq-label" style={{ fontSize: 13 }}>
                  {esRemanente ? '✅ Remanente de Crédito Fiscal (a favor)' : '💳 IVA a pagar al Fisco'}
                </span>
                <span className="liq-val" style={{ fontSize: 20 }}>
                  {fmt(Math.abs(ivaAPagar))}
                </span>
              </div>
            </div>

            {/* Nota legal */}
            <div style={{ fontSize: 10, color: '#64748b', borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8 }}>
              Declaración preparada con el sistema iFactu DTE El Salvador.
              Los valores deben ser verificados y declarados en el portal de Hacienda antes del último día hábil del mes siguiente al período declarado.
              NIT: {empresa?.nit ?? '—'} | NRC: {empresa?.nrc ?? '—'} | Período: {MESES[mes-1]} {anio}
            </div>

            {/* Firmas */}
            <div className="firma">
              <div className="firma-box">Firma del Contribuyente o Representante Legal</div>
              <div className="firma-box">Sello de la Empresa</div>
            </div>
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
            <button
              className="btn btn-primary"
              onClick={() => generar.mutate()}
              disabled={generar.isPending}
            >
              {generar.isPending ? '⏳ Generando...' : '⚡ Generar asientos del mes'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Procesa todos los DTEs emitidos y compras registradas del período
            </div>
          </div>
          {generar.isSuccess && (
            <div style={{ fontSize: 13, color: '#16a34a', background: '#f0fdf4', padding: '8px 14px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              ✅ {(generar.data as any).data.generados} asientos generados · {(generar.data as any).data.omitidos} ya existían
            </div>
          )}
          {generar.isError && (
            <div style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>
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
    return (
      <div className="modal-backdrop" onClick={() => setDetalle(null)}>
        <div className="modal-content" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
          <h3 style={{ marginBottom: 4 }}>Asiento Contable</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {detalle.fecha} &nbsp;·&nbsp; <PillTipo tipo={detalle.tipo} />
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-main)' }}>{detalle.descripcion}</p>
          <table className="table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Cód.</th>
                <th>Cuenta</th>
                <th style={{ textAlign: 'right' }}>Debe</th>
                <th style={{ textAlign: 'right' }}>Haber</th>
              </tr>
            </thead>
            <tbody>
              {detalle.lineas.map((l, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.cuenta}</td>
                  <td style={{ fontSize: 13 }}>{l.nombreCuenta}</td>
                  <td style={{ textAlign: 'right', color: l.debe > 0 ? '#1e40af' : 'var(--text-muted)', fontWeight: l.debe > 0 ? 700 : 400 }}>
                    {l.debe > 0 ? fmt(l.debe) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', color: l.haber > 0 ? '#16a34a' : 'var(--text-muted)', fontWeight: l.haber > 0 ? 700 : 400 }}>
                    {l.haber > 0 ? fmt(l.haber) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>Totales</td>
                <td style={{ textAlign: 'right', color: '#1e40af' }}>{fmt(detalle.totalDebe)}</td>
                <td style={{ textAlign: 'right', color: '#16a34a' }}>{fmt(detalle.totalHaber)}</td>
              </tr>
            </tfoot>
          </table>
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
