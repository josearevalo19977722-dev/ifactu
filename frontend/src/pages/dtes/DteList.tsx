import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dteApi } from '../../api/dte.api';
import { API_BASE } from '../../api/apiClient';
import { EstadoBadge } from '../../components/EstadoBadge';
import { EmptyState } from '../../components/EmptyState';
import { parseApiError } from '../../utils/parseApiError';
import type { Dte, EstadoDte } from '../../types/dte';

const TIPO_LABELS: Record<string, string> = {
  '01': 'CF',
  '03': 'CCF',
  '04': 'NRE',
  '05': 'NC',
  '06': 'ND',
  '07': 'RETEN',
  '11': 'FEXE',
  '14': 'FSE',
  '15': 'DON',
};

export function DteList() {
  const [tipoDte, setTipoDte] = useState('');
  const [estado,  setEstado]  = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page,    setPage]    = useState(1);
  const qc = useQueryClient();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Modal anulación
  const [selectedDte, setSelectedDte] = useState<Dte | null>(null);
  const [motivo, setMotivo] = useState('');
  const [responsable, setResponsable] = useState('');
  const [numDocResp, setNumDocResp] = useState('');

  // Debounce the search query by 400ms
  const handleBusqueda = useCallback((val: string) => {
    setBusqueda(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQ(val);
      setPage(1);
    }, 400);
  }, []);

  const anularMut = useMutation({
    mutationFn: () => {
      if (!selectedDte) throw new Error('Sin documento seleccionado');
      return dteApi.anular(selectedDte.id, {
      tipoAnulacion: 2,
      motivoAnulacion: motivo,
      nombreResponsable: responsable,
      tipDocResponsable: '13',
      numDocResponsable: numDocResp,
      nombreSolicita: responsable,
      tipDocSolicita: '13',
      numDocSolicita: numDocResp,
    });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dtes'] });
      setSelectedDte(null);
    },
  });

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['dtes', tipoDte, estado, debouncedQ, page],
    queryFn: () => dteApi.listar({
      tipoDte: tipoDte || undefined,
      estado:  estado  || undefined,
      q: debouncedQ || undefined,
      page,
      limit: 20,
    }),
  });

  const exportarCsv = () => {
    const params = new URLSearchParams();
    if (tipoDte) params.set('tipoDte', tipoDte);
    if (estado) params.set('estado', estado);
    if (debouncedQ) params.set('q', debouncedQ);
    const token = localStorage.getItem('dte_token');
    const root = API_BASE.replace(/\/$/, '');
    const url = `${root}/dte/exportar/csv?${params.toString()}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async r => {
        if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
        return r.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `dtes-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {
        window.alert('No se pudo descargar el CSV. Comprueba sesión y que el API esté en marcha.');
      });
  };

  const [dtes, total] = data ?? [[], 0];
  const totalPages = Math.ceil(total / 20);

  const countByEstado = (e: EstadoDte) => dtes.filter((d) => d.estado === e).length;
  const recibidos = countByEstado('RECIBIDO');
  const rechazados = countByEstado('RECHAZADO');
  const pendientes = countByEstado('PENDIENTE');
  const contingencias = countByEstado('CONTINGENCIA');

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">DTEs Emitidos</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={exportarCsv}>↓ CSV</button>
          <Link to="/cf/nuevo" className="btn btn-primary btn-sm">+ Factura CF</Link>
          <Link to="/ccf/nuevo" className="btn btn-sm">+ Crédito Fiscal</Link>
        </div>
      </div>

      <div style={{ padding: '20px 28px', flex: 1 }}>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon blue">📄</div>
            <div className="stat-info">
              <div className="stat-value">{total}</div>
              <div className="stat-label">Total emitidos</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">✅</div>
            <div className="stat-info">
              <div className="stat-value">{recibidos}</div>
              <div className="stat-label">Recibidos MH</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon yellow">⏳</div>
            <div className="stat-info">
              <div className="stat-value">{pendientes}</div>
              <div className="stat-label">Pendientes</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red">❌</div>
            <div className="stat-info">
              <div className="stat-value">{rechazados}</div>
              <div className="stat-label">Rechazados</div>
            </div>
          </div>
          {contingencias > 0 && (
            <div className="stat-card">
              <div className="stat-icon orange">⚠️</div>
              <div className="stat-info">
                <div className="stat-value">{contingencias}</div>
                <div className="stat-label">Contingencia</div>
              </div>
            </div>
          )}
        </div>

        <div className="table-card">
          <div className="table-header">
            <span className="table-title">Documentos</span>
            <div className="table-filters">
              <input
                className="filter-search"
                placeholder="Buscar receptor, N° control..."
                value={busqueda}
                onChange={e => handleBusqueda(e.target.value)}
              />
              <select
                className="filter-select"
                value={tipoDte}
                onChange={(e) => { setTipoDte(e.target.value); setPage(1); }}
              >
                <option value="">Todos los tipos</option>
                <option value="01">Consumidor Final (CF)</option>
                <option value="03">Crédito Fiscal (CCF)</option>
                <option value="05">Nota de Crédito (NC)</option>
                <option value="06">Nota de Débito (ND)</option>
                <option value="04">Nota de Remisión (NRE)</option>
                <option value="11">Factura Exportación (FEXE)</option>
                <option value="07">Comprobante Retención</option>
                <option value="14">Factura Sujeto Excluido</option>
                <option value="15">Comprobante Donación</option>
              </select>
              <select
                className="filter-select"
                value={estado}
                onChange={(e) => { setEstado(e.target.value); setPage(1); }}
              >
                <option value="">Todos los estados</option>
                <option value="RECIBIDO">Recibido</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="RECHAZADO">Rechazado</option>
                <option value="CONTINGENCIA">Contingencia</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </div>
          </div>

          {isLoading && (
            <div className="loading-wrap"><div className="spinner" /></div>
          )}

          {error && (
            <div style={{ padding: '20px 16px' }}>
              <div
                className="empty-state empty-state--compact empty-state--rich"
                style={{
                  border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--border))',
                  borderRadius: 12,
                  background: 'color-mix(in srgb, var(--danger) 8%, var(--color-surface))',
                }}
              >
                <div className="empty-state-icon" aria-hidden>
                  📡
                </div>
                <h3 className="empty-state-title" style={{ color: 'var(--text)' }}>
                  No se pudo cargar la lista
                </h3>
                <p className="empty-state-desc">
                  {parseApiError(error).join(' ') || 'Error de red o el servidor no respondió.'}
                </p>
                <div className="empty-state-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={isRefetching}
                    onClick={() => refetch()}
                  >
                    {isRefetching ? 'Reintentando…' : 'Reintentar'}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
                  Asegúrate de que el backend esté ejecutándose y que la URL del API en{' '}
                  <code style={{ fontSize: 11 }}>.env</code> (<code style={{ fontSize: 11 }}>VITE_API_URL</code>)
                  coincida con el servidor (p. ej. <code style={{ fontSize: 11 }}>http://127.0.0.1:3002/api</code>).
                </p>
              </div>
            </div>
          )}

          {!isLoading && !error && (
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>N° Control</th>
                  <th>Fecha</th>
                  <th>Receptor</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dtes.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        compact
                        icon="🧾"
                        title="Sin documentos con estos filtros"
                        description="Prueba limpiar la búsqueda o elegir otro tipo o estado."
                        actions={
                          <>
                            <Link to="/cf/nuevo" className="btn btn-primary btn-sm">+ Factura CF</Link>
                            <Link to="/ccf/nuevo" className="btn btn-sm">Crédito fiscal</Link>
                          </>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  dtes.map((dte) => (
                    <tr key={dte.id}>
                      <td>
                        <span className="tipo-pill">
                          {TIPO_LABELS[dte.tipoDte] ?? dte.tipoDte}
                        </span>
                      </td>
                      <td className="mono">{dte.numeroControl}</td>
                      <td>{dte.fechaEmision}</td>
                      <td className="text-main">{dte.receptorNombre ?? '—'}</td>
                      <td className="monto">${Number(dte.totalPagar).toFixed(2)}</td>
                      <td><EstadoBadge estado={dte.estado} /></td>
                      <td>
                        <div className="table-cell-actions">
                          <Link to={`/dte/${dte.id}`} className="btn-table-action btn-table-action--view">
                            Ver detalle
                          </Link>
                          {dte.estado === 'RECIBIDO' && (
                            <button
                              type="button"
                              className="btn-table-action btn-table-action--danger"
                              onClick={() => {
                                setSelectedDte(dte);
                                setResponsable('');
                                setMotivo('');
                              }}
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>← Anterior</button>
              <span>Página {page} de {totalPages}</span>
              <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Siguiente →</button>
            </div>
          )}
        </div>
      </div>

      {selectedDte && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <h3>Anular Documento {selectedDte.numeroControl}</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Esta acción enviará un evento de invalidación al Ministerio de Hacienda.
            </p>

            <div className="form-group">
              <label className="form-label">Motivo de Anulación</label>
              <textarea 
                className="form-control" 
                rows={3} 
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: Error en datos del receptor o productos..."
              />
            </div>

            <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <div className="form-group">
                <label className="form-label">Nombre Responsable</label>
                <input 
                  className="form-control" 
                  value={responsable}
                  onChange={e => setResponsable(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">DUI Responsable</label>
                <input 
                  className="form-control" 
                  value={numDocResp}
                  onChange={e => setNumDocResp(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-ghost" onClick={() => setSelectedDte(null)}>Cancelar</button>
              <button 
                className="btn btn-primary" 
                style={{ backgroundColor: '#ef4444' }}
                disabled={!motivo || !responsable || anularMut.isPending}
                onClick={() => anularMut.mutate()}
              >
                {anularMut.isPending ? 'Procesando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

