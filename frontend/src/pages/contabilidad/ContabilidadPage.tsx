import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResumenF07 {
  mes: number; anio: number; nombreMes: string;
  cf:  { cantidad: number; gravada: number; exenta: number; iva: number; total: number };
  ccf: { cantidad: number; gravada: number; exenta: number; iva: number; total: number };
  reten: { cantidad: number; total: number };
  compras: { cantidad: number; compraGravada: number; ivaCredito: number; total: number };
  f07: { debitoFiscal: number; creditoFiscal: number; ivaPagar: number };
}

interface PagoACuenta {
  mes: number; anio: number; nombreMes: string;
  ingresosBrutos: number;
  tasa: number;
  pagoACuenta: number;
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

function fmt(n: number | string | undefined) {
  const v = Number(n ?? 0);
  return `$${v.toFixed(2)}`;
}

function PillTipo({ tipo }: { tipo: string }) {
  const map: Record<string, { label: string; color: string }> = {
    DTE_VENTA: { label: 'Venta', color: '#dbeafe' },
    COMPRA:    { label: 'Compra', color: '#dcfce7' },
    MANUAL:    { label: 'Manual', color: '#fef3c7' },
  };
  const s = map[tipo] ?? { label: tipo, color: '#f1f5f9' };
  return (
    <span style={{ background: s.color, color: '#1e293b', fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
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
  const [detalle, setDetalle] = useState<Asiento | null>(null);
  const [asPage, setAsPage]   = useState(1);
  const qc = useQueryClient();

  const params = `mes=${mes}&anio=${anio}`;

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
      qc.invalidateQueries({ queryKey: ['asientos', mes, anio, asPage] });
    },
  });

  // ── Selector de período ────────────────────────────────────────────────────
  const Periodo = () => (
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
        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
          Período: <strong>{MESES[mes-1]} {anio}</strong>
        </span>
      </div>
    </div>
  );

  // ── Tab: F-07 IVA ─────────────────────────────────────────────────────────
  const TabF07 = () => {
    const d = qF07.data;
    return (
      <div>
        {qF07.isLoading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>}
        {d && (
          <>
            {/* KPI cards */}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              {[
                { icon: '🧾', label: 'Facturas CF',      value: String(d.cf.cantidad),                color: 'blue' },
                { icon: '📄', label: 'CCF / NC / ND',    value: String(d.ccf.cantidad),               color: 'blue' },
                { icon: '💰', label: 'Ventas Netas CF',  value: fmt(d.cf.gravada + d.cf.exenta),      color: 'green' },
                { icon: '💰', label: 'Ventas Netas CCF', value: fmt(d.ccf.gravada + d.ccf.exenta),    color: 'green' },
                { icon: '📈', label: 'Débito Fiscal',    value: fmt(d.f07.debitoFiscal),              color: 'red' },
                { icon: '📉', label: 'Crédito Fiscal',   value: fmt(d.f07.creditoFiscal),             color: 'yellow' },
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

            {/* Cuadro F-07 */}
            <div className="table-card" style={{ marginBottom: 20 }}>
              <div className="table-header">
                <span className="table-title">📊 Declaración IVA — F-07 · {d.nombreMes} {d.anio}</span>
                <button className="btn btn-sm" onClick={() => window.print()}>🖨️ Imprimir</button>
              </div>
              <div style={{ padding: '20px' }}>

                {/* Sección Débito */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    Débito Fiscal (Ventas)
                  </div>
                  <table className="table" style={{ maxWidth: 580 }}>
                    <thead>
                      <tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Neto</th><th style={{ textAlign: 'right' }}>IVA 13%</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Ventas a Consumidores Finales ({d.cf.cantidad} CF)</td>
                        <td style={{ textAlign: 'right' }}>{fmt(d.cf.gravada)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.cf.iva)}</td>
                      </tr>
                      <tr>
                        <td>Ventas a Contribuyentes ({d.ccf.cantidad} CCF/NC/ND)</td>
                        <td style={{ textAlign: 'right' }}>{fmt(d.ccf.gravada)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.ccf.iva)}</td>
                      </tr>
                      {(d.cf.exenta + d.ccf.exenta) > 0 && (
                        <tr>
                          <td style={{ color: 'var(--text-muted)' }}>Ventas Exentas</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(d.cf.exenta + d.ccf.exenta)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700, background: '#fef2f2' }}>
                        <td>Total Débito Fiscal</td>
                        <td />
                        <td style={{ textAlign: 'right', color: '#dc2626', fontSize: 15 }}>{fmt(d.f07.debitoFiscal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Sección Crédito */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    Crédito Fiscal (Compras)
                  </div>
                  <table className="table" style={{ maxWidth: 580 }}>
                    <thead>
                      <tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Compra Neta</th><th style={{ textAlign: 'right' }}>IVA Crédito</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Compras registradas ({d.compras.cantidad} documentos)</td>
                        <td style={{ textAlign: 'right' }}>{fmt(d.compras.compraGravada)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.compras.ivaCredito)}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700, background: '#f0fdf4' }}>
                        <td>Total Crédito Fiscal</td>
                        <td />
                        <td style={{ textAlign: 'right', color: '#16a34a', fontSize: 15 }}>({fmt(d.f07.creditoFiscal)})</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* IVA a pagar */}
                <div style={{
                  background: d.f07.ivaPagar > 0 ? '#fef2f2' : '#f0fdf4',
                  border: `2px solid ${d.f07.ivaPagar > 0 ? '#fecaca' : '#bbf7d0'}`,
                  borderRadius: 10, padding: '18px 24px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  maxWidth: 580,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                      {d.f07.ivaPagar > 0 ? '💳 IVA a pagar este mes' : '✅ Saldo a favor (Remanente)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Débito ${Number(d.f07.debitoFiscal).toFixed(2)} − Crédito ${Number(d.f07.creditoFiscal).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: d.f07.ivaPagar > 0 ? '#dc2626' : '#16a34a' }}>
                    {fmt(Math.abs(d.f07.ivaPagar))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Tab: Pago a Cuenta ────────────────────────────────────────────────────
  const TabPac = () => {
    const d = qPac.data;
    return (
      <div>
        {qPac.isLoading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>}
        {d && (
          <>
            {/* Resultado principal */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Ingresos Brutos del Mes', value: fmt(d.ingresosBrutos), color: '#1e40af', bg: '#dbeafe', desc: 'Total ventas (todos los tipos)' },
                { label: 'Tasa Pago a Cuenta', value: `${d.tasa}%`, color: '#7c3aed', bg: '#ede9fe', desc: 'Anticipo mensual ISR (F-14)' },
                { label: 'Pago a Cuenta a Declarar', value: fmt(d.pagoACuenta), color: '#b45309', bg: '#fef3c7', desc: 'Ingresos brutos × 1.75%' },
              ].map(k => (
                <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: k.color, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: k.color, opacity: .75, marginTop: 4 }}>{k.desc}</div>
                </div>
              ))}
            </div>

            {/* Desglose por tipo */}
            <div className="table-card">
              <div className="table-header">
                <span className="table-title">💼 Desglose de ingresos — {d.nombreMes} {d.anio}</span>
              </div>
              <table className="table">
                <thead>
                  <tr><th>Tipo DTE</th><th style={{ textAlign: 'center' }}>Documentos</th><th style={{ textAlign: 'right' }}>Total</th></tr>
                </thead>
                <tbody>
                  {d.porTipo.map(t => (
                    <tr key={t.tipoDte}>
                      <td>
                        <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, marginRight: 8, fontFamily: 'monospace' }}>{t.tipoDte}</span>
                        {t.nombre}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t.cantidad}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(t.total)}</td>
                    </tr>
                  ))}
                  {d.porTipo.length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Sin ingresos en este período</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                    <td>Total Ingresos Brutos</td>
                    <td />
                    <td style={{ textAlign: 'right' }}>{fmt(d.ingresosBrutos)}</td>
                  </tr>
                  <tr style={{ fontWeight: 800, background: '#fef3c7' }}>
                    <td>Pago a Cuenta ({d.tasa}%)</td>
                    <td />
                    <td style={{ textAlign: 'right', color: '#b45309', fontSize: 15 }}>{fmt(d.pagoACuenta)}</td>
                  </tr>
                </tfoot>
              </table>

              <div style={{ padding: '12px 20px', background: '#fffbeb', borderTop: '1px solid #fde68a', fontSize: 12, color: '#78350f' }}>
                ℹ️ Declarar en <strong>Formulario F-14</strong> del portal de Hacienda. Fecha límite: último día hábil del mes siguiente.
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Tab: Asientos Contables ───────────────────────────────────────────────
  const TabAsientos = () => {
    const resumen  = qResumen.data;
    const [asientos, total] = qAsientos.data ?? [[], 0];
    const totalPaginas = Math.ceil(total / 30);
    const cargando = qResumen.isLoading || qAsientos.isLoading;

    return (
      <div>
        {/* Acciones + resumen */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Resumen rápido */}
          {resumen && (
            <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap' }}>
              {[
                { label: 'Asientos',    value: String(resumen.cantidad),    color: 'blue' },
                { label: 'Total Debe',  value: fmt(resumen.totalDebe),      color: 'red' },
                { label: 'Total Haber', value: fmt(resumen.totalHaber),     color: 'green' },
                { label: 'Diferencia',  value: fmt(Math.abs(Number(resumen.totalDebe) - Number(resumen.totalHaber))), color: 'yellow' },
              ].map(k => (
                <div key={k.label} className="stat-card" style={{ flex: '1 1 120px', minWidth: 120 }}>
                  <div className={`stat-icon ${k.color}`}>{k.label === 'Asientos' ? '📒' : k.label.includes('Debe') ? '⬆️' : k.label.includes('Haber') ? '⬇️' : '⚖️'}</div>
                  <div className="stat-info">
                    <div className="stat-value" style={{ fontSize: 16 }}>{k.value}</div>
                    <div className="stat-label">{k.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Botón generar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => generar.mutate()}
              disabled={generar.isPending}
            >
              {generar.isPending ? '⏳ Generando...' : '⚡ Generar asientos del mes'}
            </button>
            {generar.data && (
              <div style={{ fontSize: 12, color: '#16a34a', background: '#f0fdf4', padding: '6px 12px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                ✅ {(generar.data as any).data.generados} generados · {(generar.data as any).data.omitidos} ya existían
              </div>
            )}
            {generar.isError && (
              <div style={{ fontSize: 12, color: '#dc2626' }}>❌ Error al generar</div>
            )}
          </div>
        </div>

        {cargando && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>}

        {/* Libro Mayor */}
        {resumen && resumen.libroDiario.length > 0 && (
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header">
              <span className="table-title">📊 Libro Mayor — {MESES[mes-1]} {anio}</span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Cód.</th><th>Cuenta</th><th style={{ textAlign: 'right' }}>Debe</th><th style={{ textAlign: 'right' }}>Haber</th><th style={{ textAlign: 'right' }}>Saldo</th></tr>
              </thead>
              <tbody>
                {resumen.libroDiario.map(c => (
                  <tr key={c.codigo}>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.codigo}</td>
                    <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                    <td style={{ textAlign: 'right' }}>{c.debe > 0 ? fmt(c.debe) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{c.haber > 0 ? fmt(c.haber) : '—'}</td>
                    <td style={{
                      textAlign: 'right', fontWeight: 700,
                      color: c.saldo > 0 ? '#1e40af' : c.saldo < 0 ? '#dc2626' : 'var(--text-muted)',
                    }}>
                      {c.saldo !== 0 ? (c.saldo < 0 ? `(${fmt(Math.abs(c.saldo))})` : fmt(c.saldo)) : '—'}
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

        {/* Lista de asientos */}
        {asientos.length > 0 && (
          <div className="table-card">
            <div className="table-header">
              <span className="table-title">📒 Libro Diario — {total} asientos</span>
            </div>
            <table className="table">
              <thead>
                <tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Debe</th><th style={{ textAlign: 'right' }}>Haber</th><th /></tr>
              </thead>
              <tbody>
                {asientos.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(a)}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{a.fecha}</td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{a.descripcion}</td>
                    <td><PillTipo tipo={a.tipo} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(a.totalDebe)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(a.totalHaber)}</td>
                    <td style={{ color: '#3b82f6', fontSize: 12 }}>ver</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                <button className="btn btn-sm" disabled={asPage === 1} onClick={() => setAsPage(p => p - 1)}>← Ant</button>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Página {asPage} de {totalPaginas}</span>
                <button className="btn btn-sm" disabled={asPage >= totalPaginas} onClick={() => setAsPage(p => p + 1)}>Sig →</button>
              </div>
            )}
          </div>
        )}

        {!cargando && asientos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📒</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Sin asientos en este período</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Haz clic en "Generar asientos del mes" para crearlos desde los DTEs emitidos y compras registradas.</div>
          </div>
        )}
      </div>
    );
  };

  // ── Modal detalle asiento ─────────────────────────────────────────────────
  const ModalDetalle = () => {
    if (!detalle) return null;
    return (
      <div className="modal-backdrop" onClick={() => setDetalle(null)}>
        <div className="modal-content" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
          <h3 style={{ marginBottom: 4 }}>Asiento Contable</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            {detalle.fecha} · <PillTipo tipo={detalle.tipo} />
          </p>
          <p style={{ fontSize: 14, marginBottom: 16, fontWeight: 600 }}>{detalle.descripcion}</p>

          <table className="table" style={{ marginBottom: 16 }}>
            <thead>
              <tr><th>Cód.</th><th>Cuenta</th><th style={{ textAlign: 'right' }}>Debe</th><th style={{ textAlign: 'right' }}>Haber</th></tr>
            </thead>
            <tbody>
              {detalle.lineas.map((l, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.cuenta}</td>
                  <td>{l.nombreCuenta}</td>
                  <td style={{ textAlign: 'right', fontWeight: l.debe > 0 ? 600 : 400, color: l.debe > 0 ? '#1e40af' : 'var(--text-muted)' }}>
                    {l.debe > 0 ? fmt(l.debe) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: l.haber > 0 ? 600 : 400, color: l.haber > 0 ? '#16a34a' : 'var(--text-muted)' }}>
                    {l.haber > 0 ? fmt(l.haber) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>Totales</td>
                <td style={{ textAlign: 'right' }}>{fmt(detalle.totalDebe)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(detalle.totalHaber)}</td>
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
        <Periodo />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border-color)', paddingBottom: 0 }}>
          {([
            { id: 'f07',      label: '📊 Declaración IVA (F-07)' },
            { id: 'pac',      label: '💼 Pago a Cuenta (F-14)'   },
            { id: 'asientos', label: '📒 Asientos Contables'      },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 16px', fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2, transition: 'all .15s',
              }}
            >
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
