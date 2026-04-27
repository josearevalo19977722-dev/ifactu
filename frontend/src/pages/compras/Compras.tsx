import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import apiClient, { API_BASE } from '../../api/apiClient';
import { EmptyState } from '../../components/EmptyState';
const api = apiClient;

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface Compra {
  id?: string;
  tipoDte: string;
  numeroControl?: string;
  codigoGeneracion?: string;
  fechaEmision: string;
  proveedorNit?: string;
  proveedorNrc?: string;
  proveedorNombre: string;
  compraExenta: number;
  compraNoSujeta: number;
  compraGravada: number;
  ivaCredito: number;
  totalCompra: number;
  descripcion?: string;
  estado?: string;
}

interface ItemDte {
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  unidad?: string;
}

const HOY = new Date().toISOString().split('T')[0];
const VACIO: Compra = {
  tipoDte: '03', fechaEmision: HOY,
  proveedorNombre: '', compraExenta: 0, compraNoSujeta: 0,
  compraGravada: 0, ivaCredito: 0, totalCompra: 0,
};

function fmt(n: number | string) { return n ? `$${Number(n).toFixed(2)}` : '—'; }

export function Compras() {
  const qc = useQueryClient();
  const ahora = new Date();
  const [mes,   setMes]   = useState(ahora.getMonth() + 1);
  const [anio,  setAnio]  = useState(ahora.getFullYear());
  const [q,     setQ]     = useState('');
  const [page,  setPage]  = useState(1);
  const [modal, setModal] = useState<Compra | null>(null);
  const [jsonError, setJsonError]       = useState('');
  const [itemsImportados, setItems]     = useState<ItemDte[]>([]);
  const [rawJson, setRawJson]           = useState<any>(null);
  const [aplicarInv, setAplicarInv]     = useState(true);
  const [resultInv, setResultInv]       = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['compras', mes, anio, q, page],
    queryFn: () => api.get<[Compra[], number]>('/compras', {
      params: { mes, anio, q: q || undefined, page, limit: 20 }
    }).then(r => r.data),
  });

  const { data: resumen } = useQuery({
    queryKey: ['compras-resumen', mes, anio],
    queryFn: () => api.get<any>(`/compras/resumen?mes=${mes}&anio=${anio}`).then(r => r.data),
  });

  const [compras, total] = data ?? [[], 0];
  const totalPages = Math.ceil(total / 20);

  const { register, handleSubmit, watch, setValue, reset } = useForm<Compra>({ defaultValues: VACIO });

  // Guardar manual (sin JSON)
  const guardarMut = useMutation({
    mutationFn: (d: Compra) =>
      d.id ? api.patch(`/compras/${d.id}`, d) : api.post('/compras', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['compras-resumen'] });
      qc.invalidateQueries({ queryKey: ['inventario-productos'] });
      setModal(null); setItems([]); setRawJson(null); setResultInv(null);
    },
  });

  // Guardar desde JSON (con opción de inventario)
  const guardarJsonMut = useMutation({
    mutationFn: () => api.post<{ compra: Compra; inventario: any }>(
      '/compras/desde-json',
      { json: rawJson, aplicarInventario: aplicarInv },
    ).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['compras-resumen'] });
      qc.invalidateQueries({ queryKey: ['inventario-productos'] });
      if (data.inventario) setResultInv(data.inventario);
      else { setModal(null); setItems([]); setRawJson(null); }
    },
  });

  const anularMut = useMutation({
    mutationFn: (id: string) => api.patch(`/compras/${id}/anular`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compras'] }),
  });

  const compraGravada = watch('compraGravada');
  const calcularTotales = () => {
    const g = Number(compraGravada) || 0;
    const e = Number(watch('compraExenta')) || 0;
    const ns = Number(watch('compraNoSujeta')) || 0;
    const iva = +(g * 0.13).toFixed(2);
    setValue('ivaCredito', iva);
    setValue('totalCompra', +(e + ns + g + iva).toFixed(2));
  };

  const abrirNuevo = () => {
    reset(VACIO); setModal(VACIO);
    setJsonError(''); setItems([]); setRawJson(null); setResultInv(null);
  };

  // ── Importar desde JSON ──────────────────────────────────────────────────────
  const importarJsonMut = useMutation({
    mutationFn: (json: any) =>
      api.post<{ compra: Partial<Compra>; items: ItemDte[] }>('/compras/parsear-json', { json })
        .then(r => r.data),
    onSuccess: ({ compra, items }) => {
      reset({ ...VACIO, ...compra });
      setModal({ ...VACIO, ...compra } as Compra);
      setItems(items);
      setAplicarInv(items.length > 0);
      setJsonError('');
    },
    onError: (err: any) => {
      setJsonError(err?.response?.data?.message ?? 'No se pudo leer el JSON del DTE');
    },
  });

  const handleArchivoJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setRawJson(json);
        importarJsonMut.mutate(json);
      } catch {
        setJsonError('El archivo no es un JSON válido');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Determinar qué acción usar al guardar ────────────────────────────────────
  const onGuardar = (d: Compra) => {
    if (rawJson) {
      guardarJsonMut.mutate();
    } else {
      guardarMut.mutate(d);
    }
  };

  const isPending = guardarMut.isPending || guardarJsonMut.isPending;

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">🛒 Libro de Compras</span>
        <div className="topbar-actions">
          <button className="btn btn-sm"
            onClick={() => { window.location.href = `${API_BASE}/compras/excel?mes=${mes}&anio=${anio}`; }}>
            ↓ Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleArchivoJson}
          />
          <button
            className="btn btn-sm"
            onClick={() => { setJsonError(''); fileInputRef.current?.click(); }}
            disabled={importarJsonMut.isPending}
            title="Sube el JSON del DTE recibido — se pre-llena el formulario y se actualiza el inventario">
            {importarJsonMut.isPending ? '⏳ Leyendo...' : '📂 Importar JSON'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={abrirNuevo}>+ Manual</button>
        </div>
      </div>

      <div style={{ padding: '20px 28px', flex: 1, overflowY: 'auto' }}>

        {jsonError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            ⚠️ {jsonError}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }} onClick={() => setJsonError('')}>✕</button>
          </div>
        )}

        {/* Filtros período */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: 150, flex: '0 0 auto' }}>
            <label className="form-label">Mes</label>
            <select className="form-control" value={mes} onChange={e => { setMes(Number(e.target.value)); setPage(1); }}>
              {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 90, flex: '0 0 auto' }}>
            <label className="form-label">Año</label>
            <input className="form-control" type="number" value={anio}
              onChange={e => { setAnio(Number(e.target.value)); setPage(1); }} />
          </div>
          <div className="form-group" style={{ flex: '1 1 220px', minWidth: 'min(100%, 220px)' }}>
            <label className="form-label">Buscar</label>
            <input className="filter-search" placeholder="Proveedor, NIT, N° control..."
              value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>

        {/* Resumen del mes */}
        {resumen && (
          <div className="stats-grid" style={{ marginBottom: 20, marginTop: 8 }}>
            <div className="stat-card">
              <div className="stat-icon blue">🧾</div>
              <div className="stat-info">
                <div className="stat-value">{resumen.cantidad}</div>
                <div className="stat-label">Compras del mes</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon blue">📦</div>
              <div className="stat-info">
                <div className="stat-value">${Number(resumen.compraGravada).toFixed(2)}</div>
                <div className="stat-label">Compras gravadas</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">✅</div>
              <div className="stat-info">
                <div className="stat-value">${Number(resumen.ivaCredito).toFixed(2)}</div>
                <div className="stat-label">IVA Crédito Fiscal</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon yellow">💰</div>
              <div className="stat-info">
                <div className="stat-value">${Number(resumen.total).toFixed(2)}</div>
                <div className="stat-label">Total compras</div>
              </div>
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">Compras — {MESES[mes-1]} {anio}</span>
          </div>
          {isLoading && <div className="loading-wrap"><div className="spinner" /></div>}
          {!isLoading && (
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Tipo</th><th>N° Control</th><th>Proveedor</th>
                  <th>Gravada</th><th>IVA Crédito</th><th>Total</th><th></th>
                </tr>
              </thead>
              <tbody>
                {compras.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        compact
                        icon="🛒"
                        title="Sin compras en este período"
                        description="Registra una compra manual o importa el JSON del DTE recibido del proveedor."
                        actions={
                          <>
                            <button type="button" className="btn btn-primary btn-sm" onClick={abrirNuevo}>
                              + Registrar compra
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => { setJsonError(''); fileInputRef.current?.click(); }}
                              disabled={importarJsonMut.isPending}
                            >
                              Importar JSON
                            </button>
                          </>
                        }
                      />
                    </td>
                  </tr>
                ) : compras.map(c => (
                  <tr key={c.id}>
                    <td>{c.fechaEmision}</td>
                    <td><span className="tipo-pill">{c.tipoDte}</span></td>
                    <td className="mono" style={{ fontSize: 11 }}>{c.numeroControl || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{c.proveedorNombre}</td>
                    <td className="monto">{fmt(c.compraGravada)}</td>
                    <td className="monto" style={{ color: '#10b981', fontWeight: 600 }}>{fmt(c.ivaCredito)}</td>
                    <td className="monto" style={{ fontWeight: 700 }}>{fmt(c.totalCompra)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => { if (confirm('¿Anular esta compra?')) anularMut.mutate(c.id!) }}>
                        Anular
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {compras.length > 0 && resumen && (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--bg-subtle)' }}>
                    <td colSpan={4} style={{ textAlign: 'right' }}>TOTALES</td>
                    <td className="monto">{fmt(resumen.compraGravada)}</td>
                    <td className="monto" style={{ color: '#10b981' }}>{fmt(resumen.ivaCredito)}</td>
                    <td className="monto">{fmt(resumen.total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-sm" disabled={page===1} onClick={() => setPage(page-1)}>← Anterior</button>
              <span>Página {page} de {totalPages}</span>
              <button className="btn btn-sm" disabled={page===totalPages} onClick={() => setPage(page+1)}>Siguiente →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal registrar compra ───────────────────────────────────────────── */}
      {modal !== null && !resultInv && (
        <div className="modal-overlay" onClick={() => { setModal(null); setItems([]); setRawJson(null); }}>
          <div className="modal" style={{ maxWidth: 620, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                Registrar Compra
                {modal?.codigoGeneracion && (
                  <span style={{
                    marginLeft: 10, fontSize: 11, fontWeight: 600,
                    background: '#dcfce7', color: '#15803d',
                    padding: '2px 10px', borderRadius: 20, verticalAlign: 'middle',
                  }}>✓ Importado desde JSON</span>
                )}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setModal(null); setItems([]); setRawJson(null); }}>✕</button>
            </div>
            <div className="modal-body">
              <form id="form-compra" onSubmit={handleSubmit(onGuardar)}>
                <input type="hidden" {...register('codigoGeneracion')} />
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Fecha *</label>
                    <input className="form-control" type="date" {...register('fechaEmision', { required: true })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo DTE</label>
                    <select className="form-control" {...register('tipoDte')}>
                      <option value="03">03 - CCF</option>
                      <option value="01">01 - CF</option>
                      <option value="11">11 - FEXE</option>
                      <option value="14">14 - FSE</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">N° Control DTE</label>
                  <input className="form-control" placeholder="DTE-03-M001P001-..." {...register('numeroControl')} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">NIT Proveedor</label>
                    <input className="form-control" {...register('proveedorNit')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NRC</label>
                    <input className="form-control" {...register('proveedorNrc')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre Proveedor *</label>
                  <input className="form-control" {...register('proveedorNombre', { required: true })} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Compra exenta</label>
                    <input className="form-control" type="number" step="0.01" min="0"
                      {...register('compraExenta', { valueAsNumber: true })} onBlur={calcularTotales} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Compra no sujeta</label>
                    <input className="form-control" type="number" step="0.01" min="0"
                      {...register('compraNoSujeta', { valueAsNumber: true })} onBlur={calcularTotales} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Compra gravada *</label>
                    <input className="form-control" type="number" step="0.01" min="0"
                      {...register('compraGravada', { valueAsNumber: true, required: true })}
                      onBlur={calcularTotales} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">IVA Crédito (13%)</label>
                    <input className="form-control" type="number" step="0.01"
                      {...register('ivaCredito', { valueAsNumber: true })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total compra</label>
                    <input className="form-control" type="number" step="0.01"
                      {...register('totalCompra', { valueAsNumber: true })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción / concepto</label>
                  <input className="form-control" {...register('descripcion')} />
                </div>
              </form>

              {/* ── Ítems del DTE ── */}
              {itemsImportados.length > 0 && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      📦 Ítems del DTE ({itemsImportados.length})
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={aplicarInv}
                        onChange={e => setAplicarInv(e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 600, color: aplicarInv ? '#10b981' : 'var(--text-muted)' }}>
                        Aplicar al inventario
                      </span>
                    </label>
                  </div>
                  {!aplicarInv && (
                    <div style={{ background: '#fef9c3', borderRadius: 6, padding: '6px 12px', fontSize: 12, marginBottom: 8 }}>
                      ⚠️ Solo se registrará la compra contable, sin mover el inventario.
                    </div>
                  )}
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr><th>#</th><th>Descripción</th><th>Unidad</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Costo unit.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {itemsImportados.map((it, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{it.descripcion}</td>
                          <td>{it.unidad ?? 'UND'}</td>
                          <td style={{ textAlign: 'right' }}>{it.cantidad}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(it.costoUnitario)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(it.cantidad * it.costoUnitario)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
              <button type="submit" form="form-compra" className="btn btn-primary" disabled={isPending}>
                {isPending ? 'Guardando...' : (
                  rawJson && aplicarInv && itemsImportados.length > 0
                    ? `Registrar + inventario (${itemsImportados.length} ítem${itemsImportados.length > 1 ? 's' : ''})`
                    : 'Registrar compra'
                )}
              </button>
              <button className="btn" onClick={() => { setModal(null); setItems([]); setRawJson(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal resultado inventario ───────────────────────────────────────── */}
      {resultInv && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">✅ Compra registrada</h3>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12, fontSize: 14 }}>
                <strong>{resultInv.procesados} producto{resultInv.procesados !== 1 ? 's' : ''}</strong> agregados al inventario:
              </div>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr><th>Producto</th><th style={{ textAlign: 'right' }}>Entrada</th><th style={{ textAlign: 'right' }}>Stock actual</th></tr>
                </thead>
                <tbody>
                  {resultInv.productos.map((p: any, i: number) => (
                    <tr key={i}>
                      <td>{p.nombre}</td>
                      <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>+{p.cantidad}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" onClick={() => {
                setResultInv(null); setModal(null); setItems([]); setRawJson(null);
              }}>Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
