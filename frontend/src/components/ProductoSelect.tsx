import { useState, useEffect, useRef } from 'react';
import apiClient from '../api/apiClient';

export interface Producto {
  id: string;
  nombre: string;
  codigo?: string;
  sku?: string;
  precioVenta?: number;
  stockActual?: number;
  uniMedidaMh?: number;
  tipoItem?: number;
  descripcion?: string;
}

interface ProductoSelectProps {
  onSelect: (p: Producto) => void;
  placeholder?: string;
}

async function buscarProductos(q: string): Promise<Producto[]> {
  const { data } = await apiClient.get('/inventario/productos', {
    params: { q, limit: 200 },
  });
  const items = Array.isArray(data) ? data[0] : (data.items ?? data);
  return items || [];
}

export function ProductoSelect({ onSelect, placeholder = 'Buscar producto...' }: ProductoSelectProps) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [todos, setTodos]     = useState<Producto[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carga inicial al abrir el modal (sin filtro)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    buscarProductos('')
      .then(setTodos)
      .catch(() => setTodos([]))
      .finally(() => setLoading(false));
  }, [open]);

  // Búsqueda con debounce al escribir
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      buscarProductos(query)
        .then(setTodos)
        .catch(() => setTodos([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  // Focus en el input al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const seleccionar = (p: Producto) => {
    onSelect(p);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      {/* Botón disparador */}
      <button type="button" className="producto-select-trigger" onClick={() => setOpen(true)}>
        <svg
          className="producto-select-trigger__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <span className="producto-select-trigger__text">{placeholder}</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg)', borderRadius: 10, width: '90%', maxWidth: 680,
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" aria-hidden style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre, código o descripción..."
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  fontSize: 14, background: 'transparent', color: 'var(--text)',
                }}
              />
              {loading && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Buscando...</span>}
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Tabla */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {todos.length === 0 && !loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  {query.length > 0 ? 'No se encontraron productos' : 'No hay productos en inventario'}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', position: 'sticky', top: 0 }}>
                      <th style={th}>Producto</th>
                      <th style={th}>Código</th>
                      <th style={{ ...th, textAlign: 'right' }}>Precio</th>
                      <th style={{ ...th, textAlign: 'right' }}>Stock</th>
                      <th style={{ ...th, width: 70 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {todos.map((p, i) => (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e =>
                          (e.currentTarget.style.background =
                            'color-mix(in srgb, var(--color-brand) 16%, var(--color-surface))')
                        }
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)')}
                        onClick={() => seleccionar(p)}
                      >
                        <td style={td}>
                          <div style={{ fontWeight: 500, color: 'var(--text)' }}>{p.nombre}</div>
                          {p.descripcion && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                              {p.descripcion}
                            </div>
                          )}
                        </td>
                        <td style={{ ...td, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          {p.codigo || p.sku || '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>
                          ${Number(p.precioVenta || 0).toFixed(2)}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <span style={{
                            color: (p.stockActual ?? 0) > 0 ? '#10b981' : '#ef4444',
                            fontWeight: 600,
                          }}>
                            {p.stockActual ?? 0}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); seleccionar(p); }}
                            style={{
                              padding: '3px 10px', borderRadius: 4, border: 'none',
                              background: 'var(--primary)', color: '#fff',
                              cursor: 'pointer', fontSize: 12,
                            }}
                          >
                            Usar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '8px 18px', borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              {todos.length} producto{todos.length !== 1 ? 's' : ''} — haz clic en la fila o en "Usar" para seleccionar
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
  fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
};
const td: React.CSSProperties = {
  padding: '8px 12px', verticalAlign: 'top',
};
