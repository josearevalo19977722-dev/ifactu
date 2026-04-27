import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Dte } from '../../types/dte';
import apiClient from '../../api/apiClient';
import { EmptyState } from '../../components/EmptyState';

const api = apiClient;

const TIPOS_CONTINGENCIA = [
  { value: 1, label: '1 — No existe conexión a internet' },
  { value: 2, label: '2 — Falla en el servicio del MH' },
  { value: 3, label: '3 — Falla en el sistema del emisor' },
  { value: 4, label: '4 — Falla de suministro eléctrico' },
  { value: 5, label: '5 — Otro' },
];

interface ResultadoProcesar {
  enviados: number;
  fallidos: number;
  codigosLote: string[];
}

interface ResultadoLote {
  actualizados: number;
  rechazados: number;
  pendientes: number;
}

export function Contingencia() {
  const queryClient = useQueryClient();
  const [tipoContingencia, setTipo] = useState(1);
  const [motivo, setMotivo] = useState('');
  const [resultado, setResultado] = useState<ResultadoProcesar | null>(null);
  const [loteConsultado, setLoteConsultado] = useState<Record<string, ResultadoLote>>({});

  // DTEs en cola (estado CONTINGENCIA)
  const { data: cola = [], isLoading } = useQuery<Dte[]>({
    queryKey: ['contingencia-cola'],
    queryFn: () => api.get('/dte/contingencia/cola').then((r) => r.data),
    refetchInterval: 30000,
  });

  // DTEs en PENDIENTE (lote enviado, esperando confirmación del MH)
  const { data: pendientes = [] } = useQuery<Dte[]>({
    queryKey: ['dtes-pendientes-lote'],
    queryFn: () =>
      api.get('/dte', { params: { estado: 'PENDIENTE', limit: 50 } }).then((r) => r.data?.data ?? []),
    refetchInterval: 60000,
  });

  // Filtrar solo los que tengan un codigoLote en observaciones
  const pendientesConLote = pendientes.filter(
    (d) => d.observaciones?.includes('codigoLote:'),
  );

  const procesarMutation = useMutation({
    mutationFn: () =>
      api
        .post('/dte/contingencia/procesar', { tipoContingencia, motivoContingencia: motivo })
        .then((r) => r.data as ResultadoProcesar),
    onSuccess: (data) => {
      setResultado(data);
      setMotivo('');
      queryClient.invalidateQueries({ queryKey: ['contingencia-cola'] });
      queryClient.invalidateQueries({ queryKey: ['dtes-pendientes-lote'] });
      queryClient.invalidateQueries({ queryKey: ['dtes'] });
    },
  });

  const reintentarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/dte/${id}/reintentar`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contingencia-cola'] });
      queryClient.invalidateQueries({ queryKey: ['dtes'] });
    },
  });

  const consultarLoteMutation = useMutation({
    mutationFn: (codigoLote: string) =>
      api
        .get(`/dte/contingencia/lote/${codigoLote}`)
        .then((r) => ({ codigoLote, resultado: r.data as ResultadoLote })),
    onSuccess: ({ codigoLote, resultado: res }) => {
      setLoteConsultado((prev) => ({ ...prev, [codigoLote]: res }));
      queryClient.invalidateQueries({ queryKey: ['dtes-pendientes-lote'] });
      queryClient.invalidateQueries({ queryKey: ['dtes'] });
    },
  });

  // Extraer codigoLote único de los DTEs pendientes
  const lotesUnicos = [
    ...new Set(
      pendientesConLote
        .map((d) => {
          const m = d.observaciones?.match(/codigoLote:\s*(\S+)/);
          return m ? m[1] : null;
        })
        .filter(Boolean) as string[],
    ),
  ];

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">Gestión de Contingencia</span>
      </div>

      <div className="page">
        {/* Estadísticas */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-icon orange">⚠️</div>
            <div className="stat-info">
              <div className="stat-value">{cola.length}</div>
              <div className="stat-label">DTEs en cola</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon blue">🕐</div>
            <div className="stat-info">
              <div className="stat-value">{pendientesConLote.length}</div>
              <div className="stat-label">Esperando confirmación MH</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon purple">📦</div>
            <div className="stat-info">
              <div className="stat-value">{lotesUnicos.length}</div>
              <div className="stat-label">Lotes enviados</div>
            </div>
          </div>
        </div>

        {/* Resultado del último envío */}
        {resultado && (
          <div
            className={`alert ${resultado.fallidos === 0 ? 'alert-success' : 'alert-warning'}`}
            style={{ marginBottom: 16 }}
          >
            {resultado.fallidos === 0 ? (
              <>
                ✅ <strong>{resultado.enviados}</strong> DTE(s) enviados al MH en lote.
                {resultado.codigosLote.length > 0 && (
                  <>
                    {' '}Lote(s):{' '}
                    {resultado.codigosLote.map((c) => (
                      <code key={c} style={{ marginLeft: 4, fontSize: 11 }}>{c}</code>
                    ))}
                    . El MH los procesa en 2-3 minutos.
                  </>
                )}
              </>
            ) : (
              <>
                ⚠️ <strong>{resultado.enviados}</strong> enviados,{' '}
                <strong>{resultado.fallidos}</strong> con fallo.
              </>
            )}
          </div>
        )}

        {/* Lotes pendientes de confirmación */}
        {lotesUnicos.length > 0 && (
          <div className="detail-card" style={{ marginBottom: 24, borderLeft: '4px solid var(--info, #3b82f6)' }}>
            <div className="detail-card-header">
              🕐 Lotes enviados — pendientes de confirmación MH
            </div>
            <div className="detail-card-body">
              <p style={{ fontSize: '.875rem', color: 'var(--text-2)', marginBottom: 12 }}>
                El MH procesa cada lote en 2-3 minutos. Haz clic en "Consultar" para actualizar el estado de los DTEs.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lotesUnicos.map((lote) => {
                  const res = loteConsultado[lote];
                  const loading = consultarLoteMutation.isPending && consultarLoteMutation.variables === lote;
                  return (
                    <div
                      key={lote}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        background: 'var(--surface-2, #f8fafc)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <code style={{ fontSize: 12, flex: 1 }}>{lote}</code>
                      {res && (
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          ✅ {res.actualizados} recibidos · ❌ {res.rechazados} rechazados
                          {res.pendientes > 0 && ` · 🕐 ${res.pendientes} aún pendientes`}
                        </span>
                      )}
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => consultarLoteMutation.mutate(lote)}
                        disabled={loading}
                      >
                        {loading ? 'Consultando...' : '🔄 Consultar MH'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Procesar cola de contingencia */}
        {cola.length > 0 && (
          <div
            className="detail-card"
            style={{ marginBottom: 24, borderLeft: '4px solid var(--warning)' }}
          >
            <div className="detail-card-header">Procesar cola de contingencia</div>
            <div className="detail-card-body">
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                <strong>💡 Nota:</strong> Se registrará un evento de contingencia ante el MH, se re-firmarán
                los documentos con <code>tipoOperacion: 2</code> y se transmitirán en lote.
              </div>
              <div className="form-row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
                  <label className="form-label">Tipo de contingencia</label>
                  <select
                    className="form-control"
                    value={tipoContingencia}
                    onChange={(e) => setTipo(Number(e.target.value))}
                  >
                    {TIPOS_CONTINGENCIA.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2, minWidth: 240 }}>
                  <label className="form-label">Motivo</label>
                  <input
                    className="form-control"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej: Mantenimiento de red interna desde las 8:00 AM"
                  />
                </div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => procesarMutation.mutate()}
                  disabled={procesarMutation.isPending || !motivo.trim()}
                >
                  {procesarMutation.isPending ? (
                    <><div className="spinner spinner-sm" style={{ marginRight: 8 }} />Procesando...</>
                  ) : (
                    `🚀 Transmitir ${cola.length} DTE(s) al MH`
                  )}
                </button>
                {procesarMutation.isError && (
                  <span style={{ color: 'var(--danger)', fontSize: 13 }}>
                    ❌ {(procesarMutation.error as Error).message}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabla de DTEs en contingencia */}
        <div className="table-card">
          <div className="table-header">
            <span className="table-title">DTEs en cola de contingencia</span>
          </div>

          {isLoading && <div className="loading-wrap"><div className="spinner" /></div>}

          {!isLoading && (
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>N° Control</th>
                  <th>Fecha</th>
                  <th>Receptor</th>
                  <th>Total</th>
                  <th>Observaciones</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cola.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        compact
                        icon="✅"
                        title="Cola de contingencia vacía"
                        description="No hay documentos pendientes de envío al Ministerio de Hacienda."
                      />
                    </td>
                  </tr>
                ) : (
                  cola.map((dte) => (
                    <tr key={dte.id}>
                      <td>
                        <span className="tipo-pill">
                          {dte.tipoDte === '01' ? 'CF' : dte.tipoDte === '03' ? 'CCF' : dte.tipoDte}
                        </span>
                      </td>
                      <td className="mono">{dte.numeroControl}</td>
                      <td>{dte.fechaEmision}</td>
                      <td className="text-main">{dte.receptorNombre ?? '—'}</td>
                      <td className="monto">${Number(dte.totalPagar).toFixed(2)}</td>
                      <td
                        className="text-muted"
                        style={{ fontSize: '0.85rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={dte.observaciones || ''}
                      >
                        {dte.observaciones ?? '—'}
                      </td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => reintentarMutation.mutate(dte.id)}
                          disabled={reintentarMutation.isPending}
                          title="Reintentar envío individual al MH"
                        >
                          Reintentar
                        </button>
                        <Link to={`/dte/${dte.id}`} className="btn btn-ghost btn-sm">
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
