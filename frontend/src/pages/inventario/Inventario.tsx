import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';

import apiClient from '../../api/apiClient';
import { EmptyState } from '../../components/EmptyState';
const api = apiClient;

interface Producto {
  id: string;
  codigo?: string;
  nombre: string;
  descripcion?: string;
  unidad: string;
  uniMedidaMh: number;
  tipoItem: number;
  stockActual: number;
  costoUnitario: number;
  precioVenta?: number;
  activo: boolean;
}

interface Movimiento {
  id: string;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  cantidad: number;
  costoUnitario: number;
  total: number;
  stockResultante: number;
  fecha: string;
  descripcion?: string;
  compraId?: string;
  dteId?: string;
  createdAt: string;
}

const TIPO_COLOR = {
  ENTRADA: { bg: '#dcfce7', color: '#15803d' },
  SALIDA:  { bg: '#fee2e2', color: '#dc2626' },
  AJUSTE:  { bg: '#fef9c3', color: '#b45309' },
};

const VACIO_PROD: Partial<Producto> = { 
  nombre: '', 
  unidad: 'Unidad', 
  uniMedidaMh: 59, 
  tipoItem: 1, 
  stockActual: 0, 
  costoUnitario: 0 
};

function fmt(n: number | string) { return `$${Number(n || 0).toFixed(2)}`; }
function fmtN(n: number | string, dec = 2) { return Number(n || 0).toFixed(dec); }

export function Inventario() {
  const qc = useQueryClient();
  const [q, setQ]               = useState('');
  const [page, setPage]         = useState(1);
  const [modal, setModal]       = useState<Partial<Producto> | null>(null);
  const [movProd, setMovProd]   = useState<Producto | null>(null);
  const [ajusteModal, setAjuste]= useState<Producto | null>(null);
  const [stockNuevo, setStockN] = useState('');
  const [ajusteDesc, setAjDesc] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inventario-productos', q, page],
    queryFn: () => api.get<[Producto[], number]>('/inventario/productos', {
      params: { q: q || undefined, page, limit: 30 }
    }).then(r => r.data),
  });

  const { data: movData } = useQuery({
    queryKey: ['inventario-movimientos', movProd?.id],
    queryFn: () => api.get<[Movimiento[], number]>(
      `/inventario/productos/${movProd!.id}/movimientos?limit=50`
    ).then(r => r.data),
    enabled: !!movProd,
  });

  const [productos, total] = data ?? [[], 0];
  const totalPages = Math.ceil(total / 30);
  const [movimientos] = movData ?? [[]];

  const { register, handleSubmit, reset, setValue } = useForm<Partial<Producto>>({ defaultValues: VACIO_PROD });

  const guardarMut = useMutation({
    mutationFn: (d: Partial<Producto>) =>
      d.id ? api.patch(`/inventario/productos/${d.id}`, d) : api.post('/inventario/productos', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario-productos'] });
      setModal(null);
    },
  });

  const eliminarMut = useMutation({
    mutationFn: (id: string) => api.delete(`/inventario/productos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventario-productos'] }),
  });

  const ajusteMut = useMutation({
    mutationFn: () => api.post('/inventario/ajuste', {
      productoId: ajusteModal!.id,
      stockNuevo: Number(stockNuevo),
      descripcion: ajusteDesc || 'Ajuste manual',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventario-productos'] });
      qc.invalidateQueries({ queryKey: ['inventario-movimientos'] });
      setAjuste(null); setStockN(''); setAjDesc('');
    },
  });

  const abrirNuevo  = () => { reset(VACIO_PROD); setModal(VACIO_PROD); };
  const abrirEditar = (p: Producto) => { reset(p); setModal(p); };

  const onGuardar = (d: any) => {
    // Buscar la descripción de la unidad seleccionada
    const unitObj = UNIDADES_MEDIDA.find(u => u.codigo === Number(d.uniMedidaMh));
    if (unitObj) {
      d.unidad = unitObj.descripcion;
    }
    d.uniMedidaMh = Number(d.uniMedidaMh);
    d.tipoItem = Number(d.tipoItem);
    guardarMut.mutate({ ...d, id: (modal as any).id });
  };

  const valorInventario = productos.reduce((s, p) => s + Number(p.stockActual) * Number(p.costoUnitario), 0);
  const sinStock = productos.filter(p => Number(p.stockActual) <= 0).length;

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">📦 Inventario</span>
        <div className="topbar-actions">
          <button className="btn btn-primary btn-sm" onClick={abrirNuevo}>+ Nuevo producto</button>
        </div>
      </div>

      <div style={{ padding: '20px 28px', flex: 1, overflowY: 'auto' }}>

        {/* KPIs */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-icon blue">📦</div>
            <div className="stat-info">
              <div className="stat-value">{total}</div>
              <div className="stat-label">Productos</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">💰</div>
            <div className="stat-info">
              <div className="stat-value">{fmt(valorInventario)}</div>
              <div className="stat-label">Valor del inventario</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red">⚠️</div>
            <div className="stat-info">
              <div className="stat-value">{sinStock}</div>
              <div className="stat-label">Sin stock (en pantalla)</div>
            </div>
          </div>
        </div>

        <div className="table-card">
          <div className="table-header">
            <span className="table-title">Catálogo de productos</span>
            <div className="table-filters">
              <input className="filter-search" placeholder="Buscar producto, código..."
                value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
            </div>
          </div>

          {isLoading && <div className="loading-wrap"><div className="spinner" /></div>}

          {!isLoading && (
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th><th>Nombre</th><th>Unidad</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right' }}>Costo prom.</th>
                  <th style={{ textAlign: 'right' }}>P. venta</th>
                  <th style={{ textAlign: 'right' }}>Valor total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {productos.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        compact
                        icon="📦"
                        title="Sin productos en el catálogo"
                        description="Se crean al importar una compra desde JSON o puedes dar de alta productos manualmente."
                        actions={
                          <>
                            <Link to="/compras" className="btn btn-primary btn-sm">
                              Ir a Libro de compras
                            </Link>
                            <button type="button" className="btn btn-sm" onClick={abrirNuevo}>
                              + Producto manual
                            </button>
                          </>
                        }
                      />
                    </td>
                  </tr>
                ) : productos.map(p => (
                  <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.5 }}>
                    <td className="mono" style={{ fontSize: 11 }}>{p.codigo || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                    <td>{p.unidad}</td>
                    <td style={{
                      textAlign: 'right', fontWeight: 700,
                      color: Number(p.stockActual) <= 0 ? '#ef4444' : Number(p.stockActual) < 5 ? '#f59e0b' : '#10b981',
                    }}>
                      {fmtN(p.stockActual, 2)}
                    </td>
                    <td className="monto">{fmt(p.costoUnitario)}</td>
                    <td className="monto">{p.precioVenta ? fmt(p.precioVenta) : '—'}</td>
                    <td className="monto" style={{ fontWeight: 600 }}>
                      {fmt(Number(p.stockActual) * Number(p.costoUnitario))}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" title="Ver movimientos"
                          onClick={() => setMovProd(p)}>📋</button>
                        <button className="btn btn-ghost btn-sm" title="Ajustar stock"
                          onClick={() => { setAjuste(p); setStockN(String(p.stockActual)); setAjDesc(''); }}>⚖️</button>
                        <button className="btn btn-ghost btn-sm" title="Editar"
                          onClick={() => abrirEditar(p)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" title="Desactivar"
                          onClick={() => { if (confirm(`¿Desactivar "${p.nombre}"?`)) eliminarMut.mutate(p.id); }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page-1)}>← Anterior</button>
              <span>Página {page} de {totalPages}</span>
              <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(page+1)}>Siguiente →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal crear/editar producto ──────────────────────────────────────── */}
      {modal !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{(modal as any).id ? 'Editar producto' : 'Nuevo producto'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <form id="form-prod" onSubmit={handleSubmit(onGuardar)}>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Código / SKU</label>
                    <input className="form-control" placeholder="Opcional" {...register('codigo')} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Tipo de ítem</label>
                    <select 
                      className="form-control" 
                      {...register('tipoItem', { 
                        required: true,
                        onChange: (e) => {
                          if (e.target.value === "2") setValue('uniMedidaMh', 59);
                        }
                      })}
                    >
                      <option value="1">Bien</option>
                      <option value="2">Servicio</option>
                      <option value="3">Ambos (Bien y Servicio)</option>
                      <option value="4">Otros</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-control" {...register('nombre', { required: true })} />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Unidad de Medida</label>
                    <select className="form-control" {...register('uniMedidaMh', { required: true })}>
                      {UNIDADES_MEDIDA.map(u => (
                        <option key={u.codigo} value={u.codigo}>{u.descripcion}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <input className="form-control" {...register('descripcion')} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Stock actual</label>
                    <input className="form-control" type="number" step="0.0001"
                      {...register('stockActual', { valueAsNumber: true })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Costo unitario</label>
                    <input className="form-control" type="number" step="0.0001"
                      {...register('costoUnitario', { valueAsNumber: true })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Precio venta</label>
                    <input className="form-control" type="number" step="0.01"
                      {...register('precioVenta', { valueAsNumber: true })} />
                  </div>
                </div>
              </form>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
              <button type="submit" form="form-prod" className="btn btn-primary" disabled={guardarMut.isPending}>
                {guardarMut.isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ajuste de stock ─────────────────────────────────────────────── */}
      {ajusteModal && (
        <div className="modal-overlay" onClick={() => setAjuste(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">⚖️ Ajuste de stock</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setAjuste(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 14, fontSize: 14 }}>
                <strong>{ajusteModal.nombre}</strong><br />
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Stock actual: <strong>{fmtN(ajusteModal.stockActual, 4)}</strong>
                </span>
              </p>
              <div className="form-group">
                <label className="form-label">Nuevo stock</label>
                <input className="form-control" type="number" step="0.0001"
                  value={stockNuevo} onChange={e => setStockN(e.target.value)} autoFocus />
              </div>
              {stockNuevo && (
                <div style={{
                  background: Number(stockNuevo) >= Number(ajusteModal.stockActual) ? '#dcfce7' : '#fee2e2',
                  borderRadius: 6, padding: '6px 12px', fontSize: 12, marginBottom: 8,
                }}>
                  Diferencia: {Number(stockNuevo) >= Number(ajusteModal.stockActual) ? '+' : ''}
                  {(Number(stockNuevo) - Number(ajusteModal.stockActual)).toFixed(4)} {ajusteModal.unidad}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Motivo</label>
                <input className="form-control" placeholder="Conteo físico, merma, etc."
                  value={ajusteDesc} onChange={e => setAjDesc(e.target.value)} />
              </div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" onClick={() => ajusteMut.mutate()}
                disabled={ajusteMut.isPending || !stockNuevo}>
                {ajusteMut.isPending ? 'Guardando...' : 'Aplicar ajuste'}
              </button>
              <button className="btn" onClick={() => setAjuste(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal movimientos de producto ─────────────────────────────────────── */}
      {movProd && (
        <div className="modal-overlay" onClick={() => setMovProd(null)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">📋 Movimientos — {movProd.nombre}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Stock: <strong style={{ color: '#10b981' }}>{fmtN(movProd.stockActual, 2)} {movProd.unidad}</strong>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setMovProd(null)}>✕</button>
              </div>
            </div>
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th style={{ textAlign: 'right' }}>Costo unit.</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Stock result.</th>
                    <th>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          compact
                          icon={null}
                          title="Sin movimientos registrados"
                          description="Las entradas y salidas aparecerán cuando compres, vendas o ajustes stock."
                        />
                      </td>
                    </tr>
                  ) : movimientos.map(m => (
                    <tr key={m.id}>
                      <td>{m.fecha}</td>
                      <td>
                        <span style={{
                          background: TIPO_COLOR[m.tipo].bg,
                          color: TIPO_COLOR[m.tipo].color,
                          padding: '2px 8px', borderRadius: 20, fontWeight: 600, fontSize: 11,
                        }}>{m.tipo}</span>
                      </td>
                      <td style={{
                        textAlign: 'right', fontWeight: 600,
                        color: m.tipo === 'ENTRADA' ? '#10b981' : m.tipo === 'SALIDA' ? '#ef4444' : '#f59e0b',
                      }}>
                        {m.tipo === 'SALIDA' ? '-' : '+'}{fmtN(m.cantidad, 2)}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmt(m.costoUnitario)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(m.total)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtN(m.stockResultante, 2)}</td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.descripcion || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button className="btn" onClick={() => setMovProd(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
