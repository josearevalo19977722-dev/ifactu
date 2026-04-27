import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import apiClient, { API_BASE } from '../../api/apiClient';
import { EmptyState } from '../../components/EmptyState';
const api = apiClient;

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface FilaCf {
  fecha: string; control: string; nombre: string;
  exenta: number; noSuj: number; gravada: number; iva: number; total: number; estado: string;
}
interface FilaCcf extends FilaCf { nit: string; }

interface Resumen {
  mes: number; anio: number; nombreMes: string;
  cf:  { cantidad: number; exenta: number; noSuj: number; gravada: number; iva: number; total: number; filas: FilaCf[] };
  ccf: { cantidad: number; exenta: number; noSuj: number; gravada: number; iva: number; total: number; filas: FilaCcf[] };
  reten: { cantidad: number; total: number };
  compras: { cantidad: number; compraGravada: number; ivaCredito: number; total: number };
  f07: { debitoFiscal: number; creditoFiscal: number; ivaPagar: number };
}

function fmt(n: number) { return n ? `$${Number(n).toFixed(2)}` : '—'; }

function descargar(url: string) { window.location.href = url; }

async function descargarCsv(path: string, filename: string) {
  try {
    const resp = await apiClient.get(path, { responseType: 'blob' });
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  } catch (e: any) {
    alert('Error al descargar: ' + (e.message ?? 'Error desconocido'));
  }
}

export function Reportes() {
  const ahora = new Date();
  const [mes,  setMes]  = useState(ahora.getMonth() + 1);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [tab,  setTab]  = useState<'cf'|'ccf'>('cf');

  const { data, isLoading, error, refetch } = useQuery<Resumen>({
    queryKey: ['reportes-resumen', mes, anio],
    queryFn: () => api.get<Resumen>(`/reportes/resumen?mes=${mes}&anio=${anio}`).then(r => r.data),
    enabled: false,   // solo cargar al presionar "Generar"
  });

  const params = `mes=${mes}&anio=${anio}`;

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">📒 Libros Contables y Anexos</span>
      </div>

      <div style={{ padding: '20px 28px', flex: 1, overflowY: 'auto' }}>

        {/* Selector período */}
        <div className="table-card" style={{ marginBottom: 20 }}>
          <div className="table-header"><span className="table-title">Período</span></div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ minWidth: 160 }}>
                <label className="form-label">Mes</label>
                <select className="form-control" value={mes} onChange={e => setMes(Number(e.target.value))}>
                  {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 100 }}>
                <label className="form-label">Año</label>
                <input className="form-control" type="number" value={anio}
                  onChange={e => setAnio(Number(e.target.value))} min={2020} max={2099} />
              </div>
              <button className="btn btn-primary" onClick={() => refetch()} disabled={isLoading}>
                {isLoading ? 'Cargando...' : '🔍 Generar vista previa'}
              </button>
            </div>
          </div>
        </div>

        {/* Tarjetas de descarga */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="table-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📗</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Libro Ventas CF</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Facturas consumidor final (tipo 01)<br/>Columnas: fecha, N° control, receptor, exentas, gravadas, IVA
            </div>
            <button className="btn btn-sm" style={{ width: '100%' }}
              onClick={() => descargar(`${API_BASE}/reportes/libro-ventas-cf?${params}`)}>
              ↓ Descargar Excel
            </button>
          </div>

          <div className="table-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📘</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Libro Ventas CCF</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Crédito fiscal + NC + ND (tipos 03/05/06)<br/>Columnas: tipo, fecha, NIT, nombre, gravadas, IVA
            </div>
            <button className="btn btn-sm" style={{ width: '100%' }}
              onClick={() => descargar(`${API_BASE}/reportes/libro-ventas-ccf?${params}`)}>
              ↓ Descargar Excel
            </button>
          </div>

          <div className="table-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Anexo F-07</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Declaración mensual IVA<br/>4 hojas: Resumen · CF · CCF · Retenciones
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%' }}
              onClick={() => descargar(`${API_BASE}/reportes/anexo-f07?${params}`)}>
              ↓ Descargar Anexo F-07
            </button>
          </div>
        </div>

        {/* Archivos CSV para carga en portal Hacienda (F-07) */}
        <div className="table-card" style={{ marginBottom: 24 }}>
          <div className="table-header">
            <span className="table-title">📤 Archivos CSV — Carga Portal Hacienda (F-07)</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Formato requerido por Hacienda El Salvador
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '16px 20px' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Anexo 1 — Ventas a Contribuyentes</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                CCF, Notas de Crédito y Débito (tipos 03/05/06)<br/>20 columnas · 1 fila por DTE
              </div>
              <button className="btn btn-sm" style={{ width: '100%' }}
                onClick={() => descargarCsv(
                  `/reportes/csv-anexo1?${params}`,
                  `Anexo1-VentasContribuyentes-${anio}-${String(mes).padStart(2,'0')}.csv`
                )}>
                ↓ Descargar CSV Anexo 1
              </button>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Anexo 2 — Ventas Consumidor Final</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Facturas CF (tipo 01)<br/>23 columnas · 1 fila por día
              </div>
              <button className="btn btn-sm" style={{ width: '100%' }}
                onClick={() => descargarCsv(
                  `/reportes/csv-anexo2?${params}`,
                  `Anexo2-VentasConsumidorFinal-${anio}-${String(mes).padStart(2,'0')}.csv`
                )}>
                ↓ Descargar CSV Anexo 2
              </button>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Anexo 3 — Compras</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Todas las compras registradas<br/>21 columnas · 1 fila por compra
              </div>
              <button className="btn btn-sm" style={{ width: '100%' }}
                onClick={() => descargarCsv(
                  `/reportes/csv-anexo3?${params}`,
                  `Anexo3-Compras-${anio}-${String(mes).padStart(2,'0')}.csv`
                )}>
                ↓ Descargar CSV Anexo 3
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            ⚠️ Error al cargar datos. Verifica que el backend esté corriendo.
          </div>
        )}

        {/* Vista previa */}
        {data && (
          <>
            {/* KPIs */}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              <div className="stat-card">
                <div className="stat-icon blue">🧾</div>
                <div className="stat-info">
                  <div className="stat-value">{data.cf.cantidad}</div>
                  <div className="stat-label">Facturas CF</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green">💰</div>
                <div className="stat-info">
                  <div className="stat-value">${Number(data.cf.total).toFixed(2)}</div>
                  <div className="stat-label">Total CF</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon blue">📄</div>
                <div className="stat-info">
                  <div className="stat-value">{data.ccf.cantidad}</div>
                  <div className="stat-label">CCF / NC / ND</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green">💰</div>
                <div className="stat-info">
                  <div className="stat-value">${Number(data.ccf.total).toFixed(2)}</div>
                  <div className="stat-label">Total CCF</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon yellow">🏦</div>
                <div className="stat-info">
                  <div className="stat-value">{data.reten.cantidad}</div>
                  <div className="stat-label">Retenciones</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon red">📊</div>
                <div className="stat-info">
                  <div className="stat-value">${Number(data.f07.debitoFiscal).toFixed(2)}</div>
                  <div className="stat-label">Débito Fiscal IVA</div>
                </div>
              </div>
            </div>

            {/* Cuadro F-07: IVA a pagar */}
            <div className="table-card" style={{ marginBottom: 20 }}>
              <div className="table-header">
                <span className="table-title">📊 Cálculo F-07 — IVA del período</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.nombreMes} {data.anio}</span>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <table className="table" style={{ maxWidth: 540 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>Débito Fiscal (IVA ventas CF + CCF)</td>
                      <td className="monto" style={{ fontWeight: 600 }}>${Number(data.f07.debitoFiscal).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        Crédito Fiscal (IVA compras — {data.compras.cantidad} registros)
                      </td>
                      <td className="monto" style={{ fontWeight: 600, color: '#10b981' }}>
                        (${Number(data.f07.creditoFiscal).toFixed(2)})
                      </td>
                    </tr>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <td style={{ fontWeight: 700, fontSize: 14 }}>IVA a pagar / (saldo a favor)</td>
                      <td className="monto" style={{
                        fontWeight: 800, fontSize: 16,
                        color: data.f07.ivaPagar >= 0 ? '#ef4444' : '#10b981',
                      }}>
                        ${Number(data.f07.ivaPagar).toFixed(2)}
                        {data.f07.ivaPagar < 0 && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>saldo a favor</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabs CF / CCF */}
            <div className="table-card">
              <div className="table-header">
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`btn btn-sm ${tab === 'cf' ? 'btn-primary' : ''}`}
                    onClick={() => setTab('cf')}>
                    Ventas CF ({data.cf.cantidad})
                  </button>
                  <button
                    className={`btn btn-sm ${tab === 'ccf' ? 'btn-primary' : ''}`}
                    onClick={() => setTab('ccf')}>
                    Ventas CCF ({data.ccf.cantidad})
                  </button>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {data.nombreMes} {data.anio}
                </span>
              </div>

              {tab === 'cf' && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th><th>Fecha</th><th>N° Control</th><th>Receptor</th>
                      <th>Exenta</th><th>Gravada</th><th>IVA</th><th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cf.filas.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <EmptyState
                            compact
                            icon="🧾"
                            title="Sin facturas CF en este período"
                            description="Las ventas a consumidor final aparecerán aquí cuando existan en el mes seleccionado."
                            actions={
                              <Link to="/cf/nuevo" className="btn btn-primary btn-sm">+ Nueva factura CF</Link>
                            }
                          />
                        </td>
                      </tr>
                    ) : data.cf.filas.map((f, i) => (
                      <tr key={i}>
                        <td>{i+1}</td>
                        <td>{f.fecha}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{f.control}</td>
                        <td>{f.nombre || 'Consumidor Final'}</td>
                        <td className="monto">{fmt(f.exenta)}</td>
                        <td className="monto">{fmt(f.gravada)}</td>
                        <td className="monto">{fmt(f.iva)}</td>
                        <td className="monto" style={{ fontWeight: 600 }}>{fmt(f.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {data.cf.filas.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                        <td colSpan={4} style={{ textAlign: 'right' }}>TOTALES</td>
                        <td className="monto">{fmt(data.cf.exenta)}</td>
                        <td className="monto">{fmt(data.cf.gravada)}</td>
                        <td className="monto">{fmt(data.cf.iva)}</td>
                        <td className="monto">{fmt(data.cf.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {tab === 'ccf' && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th><th>Fecha</th><th>N° Control</th><th>NIT</th><th>Nombre</th>
                      <th>Exenta</th><th>Gravada</th><th>IVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ccf.filas.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <EmptyState
                            compact
                            icon="📋"
                            title="Sin crédito fiscal en este período"
                            description="Las ventas con crédito fiscal (CCF) se listan aquí según el mes del reporte."
                            actions={
                              <Link to="/ccf/nuevo" className="btn btn-primary btn-sm">+ Nuevo CCF</Link>
                            }
                          />
                        </td>
                      </tr>
                    ) : data.ccf.filas.map((f, i) => (
                      <tr key={i}>
                        <td>{i+1}</td>
                        <td>{f.fecha}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{f.control}</td>
                        <td className="mono">{f.nit || '—'}</td>
                        <td>{f.nombre}</td>
                        <td className="monto">{fmt(f.exenta)}</td>
                        <td className="monto">{fmt(f.gravada)}</td>
                        <td className="monto">{fmt(f.iva)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {data.ccf.filas.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                        <td colSpan={5} style={{ textAlign: 'right' }}>TOTALES</td>
                        <td className="monto">{fmt(data.ccf.exenta)}</td>
                        <td className="monto">{fmt(data.ccf.gravada)}</td>
                        <td className="monto">{fmt(data.ccf.iva)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
