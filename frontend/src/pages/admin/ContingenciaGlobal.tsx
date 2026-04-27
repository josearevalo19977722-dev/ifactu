import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/apiClient';

interface DteConEmpresa {
  id:             string;
  tipoDte:        string;
  numeroControl:  string;
  fechaEmision:   string;
  receptorNombre: string | null;
  totalPagar:     number;
  estado:         string;
  observaciones:  string | null;
  createdAt:      string;
  empresa:        { id: string; nombreLegal: string } | null;
}

const TIPO_LABEL: Record<string, string> = {
  '01': 'CF', '03': 'CCF', '05': 'NC', '06': 'ND',
  '07': 'CR', '11': 'FEX', '14': 'FSE', '15': 'DON',
};

const ESTADO_STYLE: Record<string, { bg: string; color: string }> = {
  CONTINGENCIA: { bg: '#fef3c7', color: '#92400e' },
  PENDIENTE:    { bg: '#dbeafe', color: '#1e40af' },
};

export function ContingenciaGlobal() {
  const qc = useQueryClient();

  const { data: dtes = [], isLoading, dataUpdatedAt } = useQuery<DteConEmpresa[]>({
    queryKey: ['contingencia-global'],
    queryFn:  () => apiClient.get('/dte/contingencia/global').then(r => r.data),
    refetchInterval: 30_000,
  });

  // Agrupar por empresa
  const porEmpresa = dtes.reduce<Record<string, { nombre: string; dtes: DteConEmpresa[] }>>((acc, d) => {
    const id     = d.empresa?.id ?? 'sin-empresa';
    const nombre = d.empresa?.nombreLegal ?? 'Sin empresa';
    if (!acc[id]) acc[id] = { nombre, dtes: [] };
    acc[id].dtes.push(d);
    return acc;
  }, {});

  const totalContingencia = dtes.filter(d => d.estado === 'CONTINGENCIA').length;
  const totalPendiente    = dtes.filter(d => d.estado === 'PENDIENTE').length;
  const empresasAfectadas = Object.keys(porEmpresa).length;

  const hora = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">Contingencia Global</span>
        <span style={{ marginLeft: 'auto', fontSize: '.8rem', color: 'var(--text-3)' }}>
          Actualizado {hora} · se refresca cada 30 s
        </span>
        <button
          className="btn btn-sm btn-ghost"
          style={{ marginLeft: 12 }}
          onClick={() => qc.invalidateQueries({ queryKey: ['contingencia-global'] })}
        >
          🔄 Actualizar
        </button>
      </div>

      <div className="page">

        {/* Stats */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-icon orange">⚠️</div>
            <div className="stat-info">
              <div className="stat-value">{totalContingencia}</div>
              <div className="stat-label">En cola de contingencia</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon blue">🕐</div>
            <div className="stat-info">
              <div className="stat-value">{totalPendiente}</div>
              <div className="stat-label">Pendientes de confirmación MH</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon purple">🏢</div>
            <div className="stat-info">
              <div className="stat-value">{empresasAfectadas}</div>
              <div className="stat-label">Empresas con documentos pendientes</div>
            </div>
          </div>
        </div>

        {isLoading && <div className="loading-wrap"><div className="spinner" /></div>}

        {!isLoading && dtes.length === 0 && (
          <div className="detail-card">
            <div className="detail-card-body" style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Todo en orden</div>
              <p style={{ color: 'var(--text-2)', marginTop: 6 }}>
                No hay documentos en contingencia ni pendientes de confirmación en ninguna empresa.
              </p>
            </div>
          </div>
        )}

        {/* Una card por empresa */}
        {Object.entries(porEmpresa).map(([empId, { nombre, dtes: items }]) => {
          const enCola      = items.filter(d => d.estado === 'CONTINGENCIA').length;
          const enPendiente = items.filter(d => d.estado === 'PENDIENTE').length;

          return (
            <div
              key={empId}
              className="detail-card"
              style={{
                marginBottom: 20,
                borderLeft: enCola > 0
                  ? '4px solid var(--warning)'
                  : '4px solid var(--info, #3b82f6)',
              }}
            >
              {/* Header empresa */}
              <div className="detail-card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700 }}>{nombre}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {enCola > 0 && (
                    <span style={{ fontSize: '.8rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                      ⚠️ {enCola} en cola
                    </span>
                  )}
                  {enPendiente > 0 && (
                    <span style={{ fontSize: '.8rem', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                      🕐 {enPendiente} pendiente{enPendiente !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </div>

              {/* Tabla de DTEs */}
              <div className="detail-card-body" style={{ padding: 0 }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>N° Control</th>
                      <th>Fecha</th>
                      <th>Receptor</th>
                      <th>Total</th>
                      <th>Estado</th>
                      <th>Observaciones</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(d => {
                      const estStyle = ESTADO_STYLE[d.estado] ?? { bg: '#f3f4f6', color: '#374151' };
                      return (
                        <tr key={d.id}>
                          <td>
                            <span className="tipo-pill">
                              {TIPO_LABEL[d.tipoDte] ?? d.tipoDte}
                            </span>
                          </td>
                          <td className="mono" style={{ fontSize: '.8rem' }}>{d.numeroControl}</td>
                          <td>{d.fechaEmision}</td>
                          <td className="text-main">{d.receptorNombre ?? '—'}</td>
                          <td className="monto">${Number(d.totalPagar).toFixed(2)}</td>
                          <td>
                            <span className="tipo-pill" style={{ background: estStyle.bg, color: estStyle.color, fontSize: '.78rem' }}>
                              {d.estado}
                            </span>
                          </td>
                          <td
                            style={{ fontSize: '.8rem', color: 'var(--text-2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={d.observaciones ?? ''}
                          >
                            {d.observaciones ?? '—'}
                          </td>
                          <td>
                            <Link to={`/dte/${d.id}`} className="btn btn-ghost btn-sm">
                              Ver
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
