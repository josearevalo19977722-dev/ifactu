import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import apiClient from '../../api/apiClient';
import { EmptyState } from '../../components/EmptyState';
const api = apiClient;

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface FilaCf {
  fecha: string; control: string; codigoGeneracion: string | null; tipoDte: string;
  nombre: string; exenta: number; noSuj: number; gravada: number; iva: number; total: number; estado: string;
}
interface FilaCcf extends FilaCf { nit: string; }

interface GrupoVentas { cantidad: number; exenta: number; noSuj: number; gravada: number; iva: number; total: number; filas: FilaCcf[] }

interface Resumen {
  mes: number; anio: number; nombreMes: string;
  cf:  { cantidad: number; exenta: number; noSuj: number; gravada: number; iva: number; total: number; filas: FilaCf[] };
  ccf: { cantidad: number; exenta: number; noSuj: number; gravada: number; iva: number; total: number; filas: FilaCcf[] };
  // Desglose CCF/NC/ND separados para el tab "Desglose Ventas"
  ccfDetalle: {
    facturas:   GrupoVentas;
    ncEmitidas: GrupoVentas;
    ndEmitidas: GrupoVentas;
    ivaDebito:  number;
  };
  reten: { cantidad: number; total: number };
  // Compras con todos los campos para el tab "Resumen Compras"
  compras: {
    cantidad: number; compraExenta: number; compraNoSuj: number;
    compraGravada: number; ivaCredito: number; total: number;
    cantidadNC: number; ivaNC: number;
  };
  f07: {
    debitoFiscal: number; creditoFiscal: number; ivaPagar: number;
    desglose: { ivaCf: number; ivaCcf: number; ivaNC: number; ivaND: number; creditoBruto: number; ivaNCCompras: number };
  };
}

function fmt(n: number) { return n ? `$${Number(n).toFixed(2)}` : '—'; }

async function descargarArchivo(path: string, filename: string) {
  try {
    // _t rompe caché de nginx/CDN: cada descarga usa una URL única
    const sep = path.includes('?') ? '&' : '?';
    const url = `${path}${sep}_t=${Date.now()}`;
    const resp = await apiClient.get(url, { responseType: 'blob' });
    const mime = resp.headers['content-type'] ?? 'application/octet-stream';
    const blob = new Blob([resp.data], { type: mime });
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


/** Lee el mes/año guardado en sessionStorage (puesto por Compras u otras páginas) */
function leerPeriodoGuardado() {
  const ahora = new Date();
  try {
    const raw = sessionStorage.getItem('periodo_activo');
    if (raw) {
      const { mes, anio } = JSON.parse(raw);
      if (mes >= 1 && mes <= 12 && anio >= 2020) return { mes, anio };
    }
  } catch { /* ignorar */ }
  return { mes: ahora.getMonth() + 1, anio: ahora.getFullYear() };
}

export function Reportes() {
  const init = leerPeriodoGuardado();
  const [mes,  setMesRaw]  = useState(init.mes);
  const [anio, setAnioRaw] = useState(init.anio);
  const [tab,  setTab]     = useState<'cf'|'ccf'|'ventas'|'comprasTab'>('cf');
  const [paqueteLoading, setPaqueteLoading] = useState(false);

  // Al cambiar mes/año, guardarlo en sessionStorage para que otras páginas
  // (Compras, DTEs) también lo compartan y el usuario no pierda el contexto
  const setMes  = (v: number) => { setMesRaw(v);  sessionStorage.setItem('periodo_activo', JSON.stringify({ mes: v,   anio })); };
  const setAnio = (v: number) => { setAnioRaw(v); sessionStorage.setItem('periodo_activo', JSON.stringify({ mes, anio: v })); };

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
              onClick={() => descargarArchivo(`/reportes/libro-ventas-cf?${params}`, `LibroVentasCF-${anio}-${String(mes).padStart(2,'0')}.xlsx`)}>
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
              onClick={() => descargarArchivo(`/reportes/libro-ventas-ccf?${params}`, `LibroVentasCCF-${anio}-${String(mes).padStart(2,'0')}.xlsx`)}>
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
              onClick={() => descargarArchivo(`/reportes/anexo-f07?${params}`, `AnexoF07-${anio}-${String(mes).padStart(2,'0')}.xlsx`)}>
              ↓ Descargar Anexo F-07
            </button>
          </div>

          {/* PDF detallados */}
          <div className="table-card" style={{ padding: 20, borderTop: '3px solid #ef4444' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Reporte Ventas PDF</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              CF + CCF/NC/ND detallado<br/>N° control, cód. generación, total por operación
            </div>
            <button className="btn btn-sm" style={{ width: '100%', borderColor: '#ef4444', color: '#ef4444' }}
              onClick={() => descargarArchivo(`/reportes/pdf-ventas?${params}`, `ReporteVentas-${anio}-${String(mes).padStart(2,'0')}.pdf`)}>
              ↓ Descargar PDF Ventas
            </button>
          </div>

          <div className="table-card" style={{ padding: 20, borderTop: '3px solid #10b981' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Reporte Compras PDF</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Todas las compras del período<br/>N° control, cód. generación, total por operación
            </div>
            <button className="btn btn-sm" style={{ width: '100%', borderColor: '#10b981', color: '#10b981' }}
              onClick={() => descargarArchivo(`/reportes/pdf-compras?${params}`, `ReporteCompras-${anio}-${String(mes).padStart(2,'0')}.pdf`)}>
              ↓ Descargar PDF Compras
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
                onClick={() => descargarArchivo(
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
                onClick={() => descargarArchivo(
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
                onClick={() => descargarArchivo(
                  `/reportes/csv-anexo3?${params}`,
                  `Anexo3-Compras-${anio}-${String(mes).padStart(2,'0')}.csv`
                )}>
                ↓ Descargar CSV Anexo 3
              </button>
            </div>
          </div>
        </div>

        {/* Paquete Completo */}
        <div className="table-card" style={{ marginBottom: 24 }}>
          <div className="table-header" style={{ background: 'linear-gradient(135deg,#065f46,#059669)' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📦 Paquete Completo del Mes</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.75)' }}>PDFs + JSONs + CSVs F-07 en un solo ZIP</span>
          </div>
          <div style={{ padding: '18px 20px' }}>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
              Descarga todos los DTEs del mes como PDF e JSON, más los tres Anexos CSV para cargar en el portal de Hacienda, todo en un único archivo ZIP.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                { icon: '📄', label: 'PDFs individuales', desc: 'carpeta pdf/' },
                { icon: '{ }', label: 'JSONs DTE',         desc: 'carpeta json/' },
                { icon: '📊', label: 'Anexo 1 CSV',        desc: 'Ventas Contribuyentes' },
                { icon: '📊', label: 'Anexo 2 CSV',        desc: 'Ventas Consumidor Final' },
                { icon: '📊', label: 'Anexo 3 CSV',        desc: 'Compras' },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--bg-subtle)', borderRadius: 8, padding: '8px 12px',
                  fontSize: 12,
                }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary"
              disabled={paqueteLoading}
              style={{ background: '#059669', borderColor: '#047857', minWidth: 260 }}
              onClick={async () => {
                setPaqueteLoading(true);
                try {
                  await descargarArchivo(
                    `/reportes/paquete-completo?${params}`,
                    `PaqueteCompleto-${anio}-${String(mes).padStart(2,'0')}.zip`,
                  );
                } finally {
                  setPaqueteLoading(false);
                }
              }}
            >
              {paqueteLoading
                ? '⏳ Generando paquete...'
                : `⬇ Descargar Paquete Completo — ${MESES[mes-1]} ${anio}`}
            </button>
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

            {/* Tabs CF / CCF / Desglose Ventas / Resumen Compras */}
            <div className="table-card">
              <div className="table-header">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                  <button
                    className={`btn btn-sm ${tab === 'ventas' ? 'btn-primary' : ''}`}
                    onClick={() => setTab('ventas')}>
                    📊 Desglose Ventas
                  </button>
                  <button
                    className={`btn btn-sm ${tab === 'comprasTab' ? 'btn-primary' : ''}`}
                    onClick={() => setTab('comprasTab')}>
                    🛒 Resumen Compras
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

              {/* ── Tab: Desglose Ventas por tipo de DTE ── */}
              {tab === 'ventas' && (
                <div style={{ padding: '16px 20px' }}>
                  <table className="table" style={{ maxWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 180 }}>Tipo DTE</th>
                        <th style={{ textAlign: 'center' }}>Docs</th>
                        <th className="monto">Exenta</th>
                        <th className="monto">Base Gravada</th>
                        <th className="monto">IVA</th>
                        <th className="monto">Total</th>
                        <th className="monto">Efecto Débito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Facturas CF */}
                      <tr>
                        <td>🧾 Facturas CF (01)</td>
                        <td style={{ textAlign: 'center' }}>{data.cf.cantidad}</td>
                        <td className="monto">{fmt(data.cf.exenta)}</td>
                        <td className="monto">{fmt(data.cf.gravada)}</td>
                        <td className="monto">{fmt(data.cf.iva)}</td>
                        <td className="monto">{fmt(data.cf.total)}</td>
                        <td className="monto" style={{ color: '#ef4444' }}>+{fmt(data.cf.iva)}</td>
                      </tr>
                      {/* CCF */}
                      <tr>
                        <td>📄 CCF (03)</td>
                        <td style={{ textAlign: 'center' }}>{data.ccfDetalle.facturas.cantidad}</td>
                        <td className="monto">{fmt(data.ccfDetalle.facturas.exenta)}</td>
                        <td className="monto">{fmt(data.ccfDetalle.facturas.gravada)}</td>
                        <td className="monto">{fmt(data.ccfDetalle.facturas.iva)}</td>
                        <td className="monto">{fmt(data.ccfDetalle.facturas.total)}</td>
                        <td className="monto" style={{ color: '#ef4444' }}>+{fmt(data.ccfDetalle.facturas.iva)}</td>
                      </tr>
                      {/* NC emitidas */}
                      <tr style={{ color: data.ccfDetalle.ncEmitidas.cantidad > 0 ? '#10b981' : 'var(--text-muted)' }}>
                        <td>↩️ NC emitidas (05)</td>
                        <td style={{ textAlign: 'center' }}>{data.ccfDetalle.ncEmitidas.cantidad}</td>
                        <td className="monto">{data.ccfDetalle.ncEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ncEmitidas.exenta) : '—'}</td>
                        <td className="monto">{data.ccfDetalle.ncEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ncEmitidas.gravada) : '—'}</td>
                        <td className="monto">{data.ccfDetalle.ncEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ncEmitidas.iva) : '—'}</td>
                        <td className="monto">{data.ccfDetalle.ncEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ncEmitidas.total) : '—'}</td>
                        <td className="monto" style={{ color: '#10b981' }}>
                          {data.ccfDetalle.ncEmitidas.cantidad > 0 ? `−${fmt(data.ccfDetalle.ncEmitidas.iva)}` : '—'}
                        </td>
                      </tr>
                      {/* ND emitidas */}
                      <tr style={{ color: data.ccfDetalle.ndEmitidas.cantidad > 0 ? 'var(--text-1)' : 'var(--text-muted)' }}>
                        <td>📤 ND emitidas (06)</td>
                        <td style={{ textAlign: 'center' }}>{data.ccfDetalle.ndEmitidas.cantidad}</td>
                        <td className="monto">{data.ccfDetalle.ndEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ndEmitidas.exenta) : '—'}</td>
                        <td className="monto">{data.ccfDetalle.ndEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ndEmitidas.gravada) : '—'}</td>
                        <td className="monto">{data.ccfDetalle.ndEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ndEmitidas.iva) : '—'}</td>
                        <td className="monto">{data.ccfDetalle.ndEmitidas.cantidad > 0 ? fmt(data.ccfDetalle.ndEmitidas.total) : '—'}</td>
                        <td className="monto" style={{ color: '#ef4444' }}>
                          {data.ccfDetalle.ndEmitidas.cantidad > 0 ? `+${fmt(data.ccfDetalle.ndEmitidas.iva)}` : '—'}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                        <td>DÉBITO FISCAL NETO</td>
                        <td style={{ textAlign: 'center' }}>
                          {data.cf.cantidad + data.ccf.cantidad}
                        </td>
                        <td className="monto">
                          {fmt(data.cf.exenta + data.ccf.exenta)}
                        </td>
                        <td className="monto">
                          {fmt(data.cf.gravada + data.ccf.gravada)}
                        </td>
                        <td className="monto">
                          {fmt(data.cf.iva + data.ccf.iva)}
                        </td>
                        <td className="monto">
                          {fmt(data.cf.total + data.ccf.total)}
                        </td>
                        <td className="monto" style={{ color: '#ef4444' }}>
                          ${Number(data.f07.debitoFiscal).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                    * Efecto Débito = IVA que suma (CF/CCF/ND) o resta (NC emitidas) al débito fiscal del período.
                    Débito fiscal neto = débito CF + débito CCF + ND − NC.
                  </p>
                </div>
              )}

              {/* ── Tab: Resumen Compras ── */}
              {tab === 'comprasTab' && (
                <div style={{ padding: '16px 20px' }}>
                  <table className="table" style={{ maxWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th style={{ textAlign: 'center' }}>Docs</th>
                        <th className="monto">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Compras Exentas</td>
                        <td style={{ textAlign: 'center' }}>—</td>
                        <td className="monto">{fmt(data.compras.compraExenta)}</td>
                      </tr>
                      <tr>
                        <td>Compras No Sujetas</td>
                        <td style={{ textAlign: 'center' }}>—</td>
                        <td className="monto">{fmt(data.compras.compraNoSuj)}</td>
                      </tr>
                      <tr>
                        <td>Compras Gravadas (base)</td>
                        <td style={{ textAlign: 'center' }}>{data.compras.cantidad - data.compras.cantidadNC}</td>
                        <td className="monto">{fmt(data.compras.compraGravada)}</td>
                      </tr>
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td>IVA Crédito Fiscal bruto</td>
                        <td style={{ textAlign: 'center' }}>—</td>
                        <td className="monto" style={{ color: '#10b981', fontWeight: 600 }}>
                          {fmt(data.f07.desglose.creditoBruto)}
                        </td>
                      </tr>
                      {data.compras.cantidadNC > 0 && (
                        <tr style={{ color: '#f59e0b' }}>
                          <td>  (−) NC recibidas — IVA deducido</td>
                          <td style={{ textAlign: 'center' }}>{data.compras.cantidadNC}</td>
                          <td className="monto">−{fmt(data.compras.ivaNC)}</td>
                        </tr>
                      )}
                      <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                        <td>IVA Crédito Fiscal neto</td>
                        <td style={{ textAlign: 'center' }}>{data.compras.cantidad}</td>
                        <td className="monto" style={{ color: '#10b981', fontWeight: 800, fontSize: 15 }}>
                          ${Number(data.f07.creditoFiscal).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {data.compras.cantidad === 0 && (
                    <div style={{ marginTop: 16 }}>
                      <EmptyState
                        compact
                        icon="🛒"
                        title="Sin compras registradas en este período"
                        description="Sube compras desde el módulo de Compras para que aparezcan aquí."
                        actions={
                          <Link to="/compras" className="btn btn-primary btn-sm">Ir a Compras</Link>
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
