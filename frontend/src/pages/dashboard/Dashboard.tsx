import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';
import { empresaPermiteTipoDte } from '../../constants/tiposDte';
import { parseApiError } from '../../utils/parseApiError';

interface DashboardStats {
  total: number;
  porEstado: { estado: string; cantidad: string; monto: string }[];
  porTipo: { tipoDte: string; cantidad: string }[];
  ultimosMeses: { mes: string; cantidad: string; monto: string }[];
}

const TIPO_NOMBRES: Record<string, string> = {
  '01': 'CF', '03': 'CCF', '04': 'NRE', '05': 'NC',
  '06': 'ND', '07': 'RETEN', '11': 'FEXE', '14': 'FSE', '15': 'DON',
};

const ESTADO_COLORS: Record<string, string> = {
  RECIBIDO: '#10b981',
  PENDIENTE: '#f59e0b',
  RECHAZADO: '#ef4444',
  CONTINGENCIA: '#f97316',
  ANULADO: '#6b7280',
};

const CHART_COLORS = [
  'var(--color-product-primary)',
  'var(--color-product-secondary)',
  'var(--color-brand)',
  'var(--color-accent)',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
];

const BAR_CANTIDAD = '#06b6d4';
const BAR_MONTO = '#fbbf24';
const BAR_TIPO = '#22d3ee';

const axisTick = { fill: '#94a3b8', fontSize: 12, fontWeight: 500 as const };
const gridStroke = 'rgba(148, 163, 184, 0.18)';

const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 8,
  fontSize: 13,
};

function fmtFechaHoy(): string {
  return new Date().toLocaleDateString('es-SV', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function Dashboard() {
  const qc = useQueryClient();
  const { usuario, isSuperAdmin, isAdmin, isContador } = useAuth();

  const {
    data: empresaPerfil,
    isLoading: empresaLoading,
    isError: empresaError,
    error: empresaErr,
    refetch: refetchEmpresa,
  } = useQuery({
    queryKey: ['empresa'],
    queryFn: () => apiClient.get('/empresa').then(r => r.data),
    enabled: !!usuario && !isSuperAdmin,
  });

  const { data: colaContingencia = 0 } = useQuery({
    queryKey: ['contingencia-count'],
    queryFn: () => apiClient.get('/dte/contingencia/cola').then(r => r.data.length),
    refetchInterval: 60_000,
    enabled: !!usuario,
  });

  const { data: miPlan } = useQuery({
    queryKey: ['mi-plan-dashboard'],
    queryFn: () => apiClient.get('/billing/mi-plan').then(r => r.data),
    enabled: !!usuario && !isSuperAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const puede = (codigo: string) =>
    empresaPermiteTipoDte(empresaPerfil?.tiposDteHabilitados as string[] | undefined, codigo);

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    dataUpdatedAt,
  } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiClient.get<DashboardStats>('/dte/dashboard/stats').then(r => r.data),
    refetchInterval: 60_000,
  });

  const primerNombre = usuario?.nombre?.trim().split(/\s+/)[0] ?? 'Usuario';

  function refreshStats() {
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
  }

  const totalMonto =
    stats?.porEstado.reduce((s, e) => s + Number(e.monto || 0), 0) ?? 0;
  const recibidos = stats?.porEstado.find(e => e.estado === 'RECIBIDO');
  const rechazados = stats?.porEstado.find(e => e.estado === 'RECHAZADO');

  const pieData =
    stats?.porEstado.map(e => ({
      name: e.estado,
      value: Number(e.cantidad),
    })) ?? [];

  const barTipoData =
    stats?.porTipo.map(t => ({
      name: TIPO_NOMBRES[t.tipoDte] ?? t.tipoDte,
      cantidad: Number(t.cantidad),
    })) ?? [];

  const barMesData =
    stats?.ultimosMeses.map(m => ({
      name: m.mes,
      cantidad: Number(m.cantidad),
      monto: Number(Number(m.monto || 0).toFixed(2)),
    })) ?? [];

  return (
    <div className="page page-dashboard">
      <div className="topbar topbar--dashboard">
        <div className="topbar-head">
          <span className="topbar-title">Panel</span>
          <p className="topbar-subtitle">
            {isSuperAdmin
              ? 'Métricas globales de la plataforma y accesos de administración.'
              : 'Resumen de tu actividad y accesos frecuentes.'}
          </p>
        </div>
        <div className="topbar-actions dashboard-topbar-actions">
          {dataUpdatedAt ? (
            <span className="topbar-meta dashboard-updated">
              Actualizado{' '}
              {new Date(dataUpdatedAt).toLocaleTimeString('es-SV', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          ) : (
            <span className="topbar-meta">Datos en tiempo casi real</span>
          )}
          <button type="button" className="btn btn-sm btn-outline" onClick={refreshStats}>
            ⟳ Actualizar
          </button>
        </div>
      </div>

      <div className="dashboard-body">
        <section className="dashboard-welcome" aria-labelledby="dashboard-welcome-title">
          <div className="dashboard-welcome__main">
            <h1 id="dashboard-welcome-title" className="dashboard-welcome__title">
              Hola, {primerNombre}
            </h1>
            <p className="dashboard-welcome__date">{fmtFechaHoy()}</p>
            {isSuperAdmin ? (
              <p className="dashboard-welcome__meta">
                Estás viendo <strong>totales de todas las empresas</strong> registradas en iFactu.
              </p>
            ) : (
              <p className="dashboard-welcome__meta">
                {empresaLoading && (
                  <>Cargando datos de empresa…</>
                )}
                {!empresaLoading && empresaError && (
                  <>
                    <span style={{ color: 'var(--danger)' }}>
                      {parseApiError(empresaErr).join(' ') || 'No se pudo cargar el perfil de empresa.'}
                    </span>{' '}
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => refetchEmpresa()}
                      style={{ marginLeft: 4 }}
                    >
                      Reintentar
                    </button>
                    <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                      Comprueba que el API esté en ejecución y que <code style={{ fontSize: 11 }}>VITE_API_URL</code>{' '}
                      coincida con la URL del backend (p. ej. <code style={{ fontSize: 11 }}>http://127.0.0.1:3002/api</code>).
                    </span>
                  </>
                )}
                {!empresaLoading && !empresaError && empresaPerfil?.nombreLegal && (
                  <>
                    Empresa activa: <strong>{empresaPerfil.nombreLegal}</strong>
                  </>
                )}
                {!empresaLoading && !empresaError && !empresaPerfil?.nombreLegal && (
                  <>Sin nombre de empresa en el perfil.</>
                )}
              </p>
            )}
          </div>
        </section>

        {/* ── Alertas de plan ───────────────────────────────────────────── */}
        {!isSuperAdmin && miPlan && (
          <>
            {/* Sin plan activo */}
            {!miPlan.suscripcion && (
              <div style={{
                background: 'linear-gradient(135deg, #fef2f2, #fff7ed)',
                border: '1px solid #fca5a5',
                borderRadius: 10,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 22 }}>🚫</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>Sin plan activo</div>
                  <div style={{ fontSize: 13, color: '#7f1d1d', marginTop: 2 }}>
                    Tu empresa no tiene un plan de suscripción activo. No podrás emitir DTEs hasta que contrates un plan.
                  </div>
                </div>
                <Link to="/billing/mi-plan" className="btn btn-sm" style={{ background: '#dc2626', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>
                  Ver planes →
                </Link>
              </div>
            )}
            {/* DTEs casi agotados (>80%) */}
            {miPlan.suscripcion && miPlan.uso && miPlan.uso.porcentaje >= 80 && (
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                border: '1px solid #93c5fd',
                borderRadius: 10,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 22 }}>📊</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 14 }}>
                    {miPlan.uso.porcentaje}% de DTEs usados este mes
                  </div>
                  <div style={{ fontSize: 13, color: '#1e3a8a', marginTop: 2 }}>
                    Has usado <strong>{miPlan.uso.dtesUsados}</strong> de <strong>{miPlan.uso.dtesLimite}</strong> DTEs mensuales.
                    {miPlan.uso.porcentaje >= 100
                      ? ' Has alcanzado el límite. Mejora tu plan para continuar.'
                      : ` Te quedan ${miPlan.uso.dtesLimite - miPlan.uso.dtesUsados} disponibles.`}
                  </div>
                </div>
                <Link to="/billing/mi-plan" className="btn btn-sm" style={{ background: '#2563eb', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>
                  Mejorar plan →
                </Link>
              </div>
            )}
          </>
        )}

        <section className="dashboard-shortcuts-section" aria-labelledby="shortcuts-heading">
          <div className="dashboard-section-head">
            <h2 id="shortcuts-heading" className="dashboard-section-title">
              Accesos rápidos
            </h2>
            <p className="dashboard-section-desc">
              {isSuperAdmin
                ? 'Administración de la plataforma y consulta de documentos.'
                : 'Emisión, consultas y tareas habituales.'}
            </p>
          </div>
          <div className="dashboard-shortcuts-grid">
            {isSuperAdmin ? (
              <>
                <DashboardShortcut
                  to="/admin/tenants"
                  icon="🏢"
                  title="Gestionar empresas"
                  hint="Alta y configuración de inquilinos"
                />
                <DashboardShortcut
                  to="/usuarios"
                  icon="🔑"
                  title="Usuarios globales"
                  hint="Roles y accesos"
                />
                <DashboardShortcut
                  to="/dtes"
                  icon="📋"
                  title="DTEs emitidos"
                  hint="Todos los comprobantes"
                />
              </>
            ) : (
              <>
                <DashboardShortcut to="/dtes" icon="📋" title="DTEs emitidos" hint="Lista y detalle" />
                {/* Solo ADMIN/EMISOR pueden emitir */}
                {usuario?.rol !== 'CONTADOR' && puede('01') && (
                  <DashboardShortcut to="/cf/nuevo" icon="🧾" title="Nueva factura CF" hint="Consumidor final" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('03') && (
                  <DashboardShortcut to="/ccf/nuevo" icon="📄" title="Crédito fiscal" hint="CCF" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('04') && (
                  <DashboardShortcut to="/nre/nuevo" icon="🚚" title="Nota de remisión" hint="NRE" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('11') && (
                  <DashboardShortcut to="/fexe/nuevo" icon="🌍" title="Factura exportación" hint="FEXE" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('07') && (
                  <DashboardShortcut to="/retencion/nuevo" icon="🏦" title="Retención" hint="Comprobante" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('14') && (
                  <DashboardShortcut to="/fse/nuevo" icon="👤" title="Sujeto excluido" hint="FSE" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('15') && (
                  <DashboardShortcut to="/donacion/nuevo" icon="🎁" title="Donación" hint="DTE 15" />
                )}
                <DashboardShortcut to="/compras" icon="🛒" title="Libro de compras" hint="IVA compras" />
                <DashboardShortcut to="/reportes" icon="📒" title="Libros y anexos" hint="Reportes" />
                <DashboardShortcut to="/contactos" icon="👥" title="Contactos" hint="Clientes y proveedores" />
                {isAdmin && (
                  <DashboardShortcut to="/configuracion" icon="⚙️" title="Configuración" hint="Empresa y MH" />
                )}
                {isAdmin && (
                  <DashboardShortcut
                    to="/configuracion/correlativos"
                    icon="🔢"
                    title="Correlativos"
                    hint="Numeración DTE"
                  />
                )}
                <DashboardShortcut
                  to="/contingencia"
                  icon="⚠️"
                  title="Contingencia"
                  hint={colaContingencia > 0 ? `${colaContingencia} en cola` : 'Sin pendientes'}
                  badge={colaContingencia > 0 ? colaContingencia : undefined}
                />
              </>
            )}
          </div>
        </section>

        {statsLoading && (
          <div className="dashboard-stats-loading">
            <div className="spinner" />
            <span>Cargando métricas…</span>
          </div>
        )}

        {statsError && !statsLoading && (
          <div
            className="alert alert-error dashboard-stats-error"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}
          >
            <div>
              <strong>No se pudieron cargar las estadísticas.</strong>{' '}
              {parseApiError(statsError).join(' ') || 'Revisa que el servidor API esté disponible.'}
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={refreshStats}>
              Reintentar
            </button>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.9, lineHeight: 1.45 }}>
              Si acabas de iniciar el frontend, confirma que el backend NestJS esté en marcha y que{' '}
              <code style={{ fontSize: 11 }}>VITE_API_URL</code> apunte al mismo host y puerto (incluye{' '}
              <code style={{ fontSize: 11 }}>/api</code> al final).
            </p>
          </div>
        )}

        {stats && !statsLoading && (
          <>
            <div className="stats-grid dashboard-kpi-grid dashboard-kpi-wrap">
              <div className="stat-card dashboard-kpi-card">
                <div className="stat-icon blue">🧾</div>
                <div className="stat-info">
                  <div className="stat-label">Total emitidos</div>
                  <div className="stat-value">{stats.total}</div>
                </div>
              </div>
              <div className="stat-card dashboard-kpi-card">
                <div className="stat-icon yellow">💰</div>
                <div className="stat-info">
                  <div className="stat-label">Monto total facturado</div>
                  <div className="stat-value">${totalMonto.toFixed(2)}</div>
                </div>
              </div>
              <div className="stat-card dashboard-kpi-card">
                <div className="stat-icon green">✅</div>
                <div className="stat-info">
                  <div className="stat-label">Recibidos por MH</div>
                  <div className="stat-value">{recibidos?.cantidad ?? 0}</div>
                </div>
              </div>
              <div className="stat-card dashboard-kpi-card">
                <div className="stat-icon red">❌</div>
                <div className="stat-info">
                  <div className="stat-label">Rechazados</div>
                  <div className="stat-value">{rechazados?.cantidad ?? 0}</div>
                </div>
              </div>
            </div>

            <div className="dashboard-section-head dashboard-section-head--charts">
              <h2 className="dashboard-section-title">Análisis</h2>
              <p className="dashboard-section-desc">Distribución por estado, tipo y evolución mensual.</p>
            </div>

            <div className="dashboard-chart-row">
              <div className="table-card dashboard-chart-card">
                <div className="table-header">
                  <span className="table-title">Distribución por estado</span>
                </div>
                <div className="dashboard-chart-body">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={88}
                        paddingAngle={2}
                        labelLine={{ stroke: '#64748b', strokeWidth: 1 }}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={ESTADO_COLORS[entry.name] ?? CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={v => [`${v}`, 'Cantidad']}
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                      />
                      <Legend wrapperStyle={{ paddingTop: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="table-card dashboard-chart-card">
                <div className="table-header">
                  <span className="table-title">Documentos por tipo</span>
                </div>
                <div className="dashboard-chart-body">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barTipoData} margin={{ top: 16, right: 16, left: 8, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                      <XAxis
                        dataKey="name"
                        tick={axisTick}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(148,163,184,0.28)' }}
                      />
                      <YAxis tick={axisTick} allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0', fontWeight: 600 }} />
                      <Bar
                        dataKey="cantidad"
                        fill={BAR_TIPO}
                        stroke="rgba(15, 23, 42, 0.9)"
                        strokeWidth={1}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={52}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {barMesData.length > 0 && (
              <div className="table-card dashboard-chart-card dashboard-chart-card--full">
                <div className="table-header">
                  <span className="table-title">Facturación últimos 6 meses</span>
                </div>
                <div className="dashboard-chart-body dashboard-chart-body--wide">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barMesData} margin={{ top: 16, right: 18, left: 8, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                      <XAxis
                        dataKey="name"
                        tick={axisTick}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(148,163,184,0.28)' }}
                      />
                      <YAxis
                        yAxisId="left"
                        orientation="left"
                        tick={axisTick}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={axisTick}
                        tickFormatter={v => `$${v}`}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                      />
                      <Tooltip
                        formatter={(v, name) =>
                          name === 'monto' ? [`$${Number(v).toFixed(2)}`, 'Monto'] : [v, 'Cantidad']
                        }
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                      />
                      <Legend wrapperStyle={{ paddingTop: 12 }} />
                      <Bar
                        yAxisId="left"
                        dataKey="cantidad"
                        fill={BAR_CANTIDAD}
                        stroke="rgba(15, 23, 42, 0.9)"
                        strokeWidth={1}
                        radius={[6, 6, 0, 0]}
                        name="Cantidad"
                        maxBarSize={44}
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="monto"
                        fill={BAR_MONTO}
                        stroke="rgba(15, 23, 42, 0.35)"
                        strokeWidth={1}
                        radius={[6, 6, 0, 0]}
                        name="Monto ($)"
                        maxBarSize={44}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="table-card dashboard-table-wrap">
              <div className="table-header">
                <span className="table-title">Resumen por estado</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Cantidad</th>
                    <th>Monto total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.porEstado.map(e => (
                    <tr key={e.estado}>
                      <td>
                        <span
                          style={{
                            background: `${ESTADO_COLORS[e.estado]}22`,
                            color: ESTADO_COLORS[e.estado],
                            padding: '3px 10px',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {e.estado}
                        </span>
                      </td>
                      <td>{e.cantidad}</td>
                      <td className="monto">${Number(e.monto || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DashboardShortcut({
  to,
  icon,
  title,
  hint,
  badge,
}: {
  to: string;
  icon: string;
  title: string;
  hint?: string;
  badge?: number;
}) {
  return (
    <Link to={to} className="dashboard-shortcut">
      <span className="dashboard-shortcut__icon" aria-hidden>
        {icon}
      </span>
      <span className="dashboard-shortcut__text">
        <span className="dashboard-shortcut__title">{title}</span>
        {hint && <span className="dashboard-shortcut__hint">{hint}</span>}
      </span>
      {badge != null && <span className="dashboard-shortcut__badge">{badge}</span>}
    </Link>
  );
}
