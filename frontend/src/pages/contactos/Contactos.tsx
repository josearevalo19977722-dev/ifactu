import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ActividadSelect } from '../../components/ActividadSelect';
import { PAISES } from '../../catalogs/paises';

import apiClient from '../../api/apiClient';
import { EmptyState } from '../../components/EmptyState';
const api = apiClient;

interface Contacto {
  id?: string;
  tipo: string;
  tipoDocumento: string;
  numDocumento: string;
  nit?: string;
  nrc?: string;
  nombre: string;
  codActividad?: string;
  descActividad?: string;
  direccionDepartamento?: string;
  direccionMunicipio?: string;
  direccionComplemento?: string;
  telefono?: string;
  correo?: string;
  notas?: string;
  esGranContribuyente?: boolean;
  codPais?: string;
  nombrePais?: string;
}

const VACIO: Contacto = {
  tipo: 'CLIENTE', tipoDocumento: '36', numDocumento: '',
  nombre: '', nit: '', nrc: '',
  esGranContribuyente: false,
};

export function Contactos() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<Contacto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contactos', tipo, q, page],
    queryFn: () => api.get<[Contacto[], number]>('/contactos', {
      params: { tipo: tipo || undefined, q: q || undefined, page, limit: 20 }
    }).then(r => r.data),
  });

  const [contactos, total] = data ?? [[], 0];
  const totalPages = Math.ceil(total / 20);

  const { register, handleSubmit, reset, setValue, watch } = useForm<Contacto>({ defaultValues: VACIO });

  const guardarMut = useMutation({
    mutationFn: (d: Contacto) =>
      d.id ? api.patch(`/contactos/${d.id}`, d) : api.post('/contactos', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contactos'] }); setModal(null); },
  });

  const eliminarMut = useMutation({
    mutationFn: (id: string) => api.delete(`/contactos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contactos'] }),
  });

  const abrirNuevo = () => { reset(VACIO); setModal(VACIO); };
  const abrirEditar = (c: Contacto) => { reset(c); setModal(c); };

  /** Fondo + texto oscuro para contraste AA sobre filas de tabla claras */
  const TIPO_BADGE: Record<string, { bg: string; color: string }> = {
    CLIENTE: { bg: '#bfdbfe', color: '#1e3a8a' },
    PROVEEDOR: { bg: '#86efac', color: '#14532d' },
    AMBOS: { bg: '#fde047', color: '#713f12' },
  };

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">👥 Contactos</span>
        <div className="topbar-actions">
          <button className="btn btn-primary btn-sm" onClick={abrirNuevo}>+ Nuevo contacto</button>
        </div>
      </div>

      <div style={{ padding: '20px 28px', flex: 1, overflowY: 'auto' }}>
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">Clientes y Proveedores</span>
            <div className="table-filters">
              <input className="filter-search" placeholder="Buscar nombre, NIT..."
                value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
              <select className="filter-select" value={tipo}
                onChange={e => { setTipo(e.target.value); setPage(1); }}>
                <option value="">Todos</option>
                <option value="CLIENTE">Clientes</option>
                <option value="PROVEEDOR">Proveedores</option>
                <option value="AMBOS">Ambos</option>
              </select>
            </div>
          </div>

          {isLoading && <div className="loading-wrap"><div className="spinner" /></div>}

          {!isLoading && (
            <table className="table">
              <thead>
                <tr><th>Tipo</th><th>Documento</th><th>Nombre</th><th>NIT</th><th>Teléfono</th><th>Correo</th><th></th></tr>
              </thead>
              <tbody>
                {contactos.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        compact
                        icon="👥"
                        title="Sin contactos"
                        description="Añade clientes o proveedores para usarlos al emitir DTEs y en el libro de compras."
                        actions={
                          <button type="button" className="btn btn-primary btn-sm" onClick={abrirNuevo}>
                            + Nuevo contacto
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : contactos.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span
                        className="table-type-pill"
                        style={{
                          background: TIPO_BADGE[c.tipo]?.bg ?? '#e2e8f0',
                          color: TIPO_BADGE[c.tipo]?.color ?? '#0f172a',
                        }}
                      >
                        {c.tipo}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.numDocumento}</td>
                    <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.nit || '—'}</td>
                    <td>{c.telefono || '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.correo || '—'}</td>
                    <td>
                      {c.esGranContribuyente && (
                        <span style={{
                          background: '#fef3c7', color: '#92400e',
                          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        }}>GRANDE</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirEditar(c)}>✏️</button>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => { if (confirm('¿Eliminar contacto?')) eliminarMut.mutate(c.id!) }}>🗑️</button>
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

      {/* Modal */}
      {modal !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 600, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{modal.id ? 'Editar contacto' : 'Nuevo contacto'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <form id="form-contacto" onSubmit={handleSubmit(d => guardarMut.mutate({ ...d, id: modal.id }))}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tipo *</label>
                    <select className="form-control" {...register('tipo', { required: true })}>
                      <option value="CLIENTE">Cliente</option>
                      <option value="PROVEEDOR">Proveedor</option>
                      <option value="AMBOS">Ambos</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo doc. *</label>
                    <select className="form-control" {...register('tipoDocumento', { required: true })}>
                      <option value="36">36 - NIT</option>
                      <option value="13">13 - DUI</option>
                      <option value="37">37 - Otro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">N° doc. *</label>
                    <input className="form-control" {...register('numDocumento', { required: true })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">Nombre / Razón Social *</label>
                    <input className="form-control" {...register('nombre', { required: true })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">NIT</label>
                    <input className="form-control" placeholder="0000-000000-000-0" {...register('nit')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NRC</label>
                    <input className="form-control" placeholder="000000-0" {...register('nrc')} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <ActividadSelect
                    fieldCodigo="codActividad"
                    fieldDescripcion="descActividad"
                    register={register}
                    setValue={setValue}
                    watch={watch}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-control" {...register('telefono')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo</label>
                    <input className="form-control" type="email" {...register('correo')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" {...register('esGranContribuyente')} />
                    Es Gran Contribuyente (Aplica retención 1% IVA)
                  </label>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">País (para FEXE)</label>
                    <select className="form-control" {...register('codPais')} onChange={e => {
                      const sel = e.target.value;
                      const nombre = PAISES.find((p) => p.codigo === sel)?.nombre || '';
                      setValue('codPais', sel);
                      if (nombre) setValue('nombrePais', nombre);
                    }}>
                      {PAISES.map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre País</label>
                    <input className="form-control" {...register('nombrePais')} placeholder="Nombre completo" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notas</label>
                  <textarea className="form-control" rows={2} {...register('notas')} />
                </div>
              </form>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
              <button type="submit" form="form-contacto" className="btn btn-primary"
                disabled={guardarMut.isPending}>
                {guardarMut.isPending ? 'Guardando...' : 'Guardar'}
              </button>
              <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
