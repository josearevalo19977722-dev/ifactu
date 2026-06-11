import { useState } from 'react';
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
  rechazadosRecientes?: number;
}

interface DteReciente {
  id: string;
  tipoDte: string;
  numeroControl: string;
  fechaEmision: string;
  estado: string;
  receptorNombre: string | null;
  totalPagar: number;
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
  '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
];

const BAR_CANTIDAD = '#06b6d4';
const BAR_MONTO    = '#fbbf24';
const BAR_TIPO     = '#22d3ee';
const axisTick     = { fill: '#94a3b8', fontSize: 12, fontWeight: 500 as const };
const gridStroke   = 'rgba(148, 163, 184, 0.18)';
const tooltipStyle = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 8,
  fontSize: 13,
};

function fmtFechaHoy(): string {
  return new Date().toLocaleDateString('es-SV', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function Dashboard() {
  const qc = useQueryClient();
  const { usuario, isSuperAdmin, isAdmin } = useAuth();

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

  const { data: dtesRecientes } = useQuery<[DteReciente[], number]>({
    queryKey: ['dtes-recientes'],
    queryFn: () => apiClient.get('/dte?limit=6&page=1').then(r => r.data),
    enabled: !!usuario,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const primerNombre = usuario?.nombre?.trim().split(/\s+/)[0] ?? 'Usuario';

  function refreshStats() {
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    qc.invalidateQueries({ queryKey: ['dtes-recientes'] });
  }

  const totalMonto = stats?.porEstado.reduce((s, e) => s + Number(e.monto || 0), 0) ?? 0;
  const recibidos  = stats?.porEstado.find(e => e.estado === 'RECIBIDO');
  const rechazados = stats?.porEstado.find(e => e.estado === 'RECHAZADO');
  const nRechazados = Number(rechazados?.cantidad ?? 0);
  const tasaAceptacion = stats?.total
    ? Math.round((Number(recibidos?.cantidad ?? 0) / stats.total) * 100)
    : null;

  const pieData    = stats?.porEstado.map(e => ({ name: e.estado, value: Number(e.cantidad) })) ?? [];
  const barTipoData = stats?.porTipo.map(t => ({ name: TIPO_NOMBRES[t.tipoDte] ?? t.tipoDte, cantidad: Number(t.cantidad) })) ?? [];
  const barMesData  = stats?.ultimosMeses.map(m => ({
    name: m.mes,
    cantidad: Number(m.cantidad),
    monto: Number(Number(m.monto || 0).toFixed(2)),
  })) ?? [];

  const recientes = dtesRecientes?.[0] ?? [];

  const planPct = miPlan?.uso?.porcentaje ?? 0;
  const planIlimitado = (miPlan?.uso?.dtesLimite ?? 0) >= 99999;

  // Banner de rechazados: solo los de los últimos 7 días, descartable.
  // El descarte se guarda por cantidad: si aparece un rechazo nuevo, reaparece.
  const nRechazadosRecientes = stats?.rechazadosRecientes ?? 0;
  const [bannerDescartado, setBannerDescartado] = useState(
    () => localStorage.getItem('banner-rechazados-descartado') ?? '',
  );
  const mostrarBannerRechazados =
    nRechazadosRecientes > 0 && bannerDescartado !== String(nRechazadosRecientes);
  const descartarBanner = () => {
    localStorage.setItem('banner-rechazados-descartado', String(nRechazadosRecientes));
    setBannerDescartado(String(nRechazadosRecientes));
  };

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
              {new Date(dataUpdatedAt).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
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

        {/* ── Welcome ───────────────────────────────────────────────────────── */}
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
                {empresaLoading && <>Cargando datos de empresa…</>}
                {!empresaLoading && empresaError && (
                  <>
                    <span style={{ color: 'var(--danger)' }}>
                      {parseApiError(empresaErr).join(' ') || 'No se pudo cargar el perfil de empresa.'}
                    </span>{' '}
                    <button type="button" className="btn-link" onClick={() => refetchEmpresa()} style={{ marginLeft: 4 }}>
                      Reintentar
                    </button>
                  </>
                )}
                {!empresaLoading && !empresaError && empresaPerfil?.nombreLegal && (
                  <>Empresa activa: <strong>{empresaPerfil.nombreLegal}</strong></>
                )}
                {!empresaLoading && !empresaError && !empresaPerfil?.nombreLegal && (
                  <>Sin nombre de empresa en el perfil.</>
                )}
              </p>
            )}
          </div>

          {/* Plan usage inline — solo visible cuando hay plan */}
          {!isSuperAdmin && miPlan?.uso && (
            <div className="dashboard-welcome__plan">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>
                  DTEs del mes
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: planIlimitado ? '#10b981'
                    : planPct >= 100 ? '#ef4444' : planPct >= 80 ? '#f59e0b' : '#10b981',
                }}>
                  {planIlimitado
                    ? <>{miPlan.uso.dtesUsados} · Ilimitado</>
                    : <>{miPlan.uso.dtesUsados} / {miPlan.uso.dtesLimite}</>}
                </span>
              </div>
              {!planIlimitado && (
                <div style={{ height: 6, borderRadius: 99, background: 'rgba(148,163,184,.2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(planPct, 100)}%`,
                    borderRadius: 99,
                    background: planPct >= 100 ? '#ef4444' : planPct >= 80 ? '#f59e0b' : '#10b981',
                    transition: 'width .4s ease',
                  }} />
                </div>
              )}
              {planPct >= 80 && (
                <div style={{ marginTop: 6, fontSize: 12, color: planPct >= 100 ? '#ef4444' : '#f59e0b' }}>
                  {planPct >= 100
                    ? 'Límite alcanzado — '
                    : `${planPct}% usado — `}
                  <Link to="/billing/mi-plan" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>
                    {planPct >= 100 ? 'Contratar más DTEs' : 'Ver plan'}
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Sin plan activo ───────────────────────────────────────────────── */}
        {!isSuperAdmin && miPlan && !miPlan.suscripcion && (
          <div style={{
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(239,68,68,0.30)',
            borderRadius: 12, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4,
          }}>
            <span style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text, #e2e8f0)' }}>Sin plan activo</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 }}>
                Tu empresa no tiene un plan activo. No podrás emitir DTEs hasta que contrates uno.
              </div>
            </div>
            <Link to="/billing/mi-plan" className="btn btn-sm"
              style={{ background: '#ef4444', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>
              Ver planes →
            </Link>
          </div>
        )}

        {/* ── Alerta de DTEs rechazados (últimos 7 días, descartable) ──────── */}
        {mostrarBannerRechazados && !statsLoading && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(15, 23, 42, 0.45)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
              borderRadius: 12, padding: '12px 18px', marginBottom: 4,
            }}
          >
            <span style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text, #e2e8f0)' }}>
                Tienes{' '}
                <span style={{ color: '#ef4444', fontWeight: 700 }}>
                  {nRechazadosRecientes} DTE{nRechazadosRecientes > 1 ? 's' : ''} rechazado{nRechazadosRecientes > 1 ? 's' : ''}
                </span>{' '}
                por Hacienda en los últimos 7 días
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1 }}>
                Revisa el motivo de rechazo y corrige los documentos afectados.
              </div>
            </div>
            <Link to="/dtes?estado=RECHAZADO" style={{
              fontSize: 13, fontWeight: 600, color: '#ef4444', textDecoration: 'none',
              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              Ver rechazados
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={descartarBanner}
              title="Descartar — reaparecerá si hay rechazos nuevos"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 6,
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                borderRadius: 6, flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Accesos rápidos ───────────────────────────────────────────────── */}
        <section className="dashboard-shortcuts-section" aria-labelledby="shortcuts-heading">
          <div className="dashboard-section-head">
            <h2 id="shortcuts-heading" className="dashboard-section-title">Accesos rápidos</h2>
            <p className="dashboard-section-desc">
              {isSuperAdmin
                ? 'Administración de la plataforma y consulta de documentos.'
                : 'Emisión, consultas y tareas habituales.'}
            </p>
          </div>
          <div className="dashboard-shortcuts-grid">
            {isSuperAdmin ? (
              <>
                <DashboardShortcut to="/admin/tenants"  icon="🏢" title="Gestionar empresas"  hint="Alta y configuración de inquilinos" />
                <DashboardShortcut to="/usuarios"       icon="🔑" title="Usuarios globales"   hint="Roles y accesos" />
                <DashboardShortcut to="/dtes"           icon="📋" title="DTEs emitidos"        hint="Todos los comprobantes" />
              </>
            ) : (
              <>
                <DashboardShortcut to="/dtes" icon="📋" title="DTEs emitidos" hint="Lista y detalle" />
                {usuario?.rol !== 'CONTADOR' && puede('01') && (
                  <DashboardShortcut to="/cf/nuevo"          icon="🧾" title="Nueva factura CF"     hint="Consumidor final" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('03') && (
                  <DashboardShortcut to="/ccf/nuevo"         icon="📄" title="Crédito fiscal"        hint="CCF" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('04') && (
                  <DashboardShortcut to="/nre/nuevo"         icon="🚚" title="Nota de remisión"      hint="NRE" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('11') && (
                  <DashboardShortcut to="/fexe/nuevo"        icon="🌍" title="Factura exportación"   hint="FEXE" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('07') && (
                  <DashboardShortcut to="/retencion/nuevo"   icon="🏦" title="Retención"             hint="Comprobante" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('14') && (
                  <DashboardShortcut to="/fse/nuevo"         icon="👤" title="Sujeto excluido"       hint="FSE" />
                )}
                {usuario?.rol !== 'CONTADOR' && puede('15') && (
                  <DashboardShortcut to="/donacion/nuevo"    icon="🎁" title="Donación"              hint="DTE 15" />
                )}
                <DashboardShortcut to="/compras"           icon="🛒" title="Libro de compras"       hint="IVA compras" />
                <DashboardShortcut to="/reportes"          icon="📒" title="Libros y anexos"        hint="Reportes" />
                <DashboardShortcut to="/contactos"         icon="👥" title="Contactos"              hint="Clientes y proveedores" />
                {isAdmin && (
                  <DashboardShortcut to="/configuracion"             icon="⚙️" title="Configuración"   hint="Empresa y MH" />
                )}
                {isAdmin && (
                  <DashboardShortcut to="/configuracion/correlativos" icon="🔢" title="Correlativos"    hint="Numeración DTE" />
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
          <div className="alert alert-error dashboard-stats-error"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <div>
              <strong>No se pudieron cargar las estadísticas.</strong>{' '}
              {parseApiError(statsError).join(' ') || 'Revisa que el servidor API esté disponible.'}
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={refreshStats}>Reintentar</button>
          </div>
        )}

        {stats && !statsLoading && (
          <>
            {/* ── KPIs ──────────────────────────────────────────────────────── */}
            <div className="stats-grid dashboard-kpi-grid dashboard-kpi-wrap">

              {/* Total emitidos */}
              <div className="stat-card dashboard-kpi-card">
                <div className="stat-icon blue">🧾</div>
                <div className="stat-info">
                  <div className="stat-label">Total emitidos</div>
                  <div className="stat-value">{stats.total}</div>
                </div>
              </div>

              {/* Monto facturado */}
              <div className="stat-card dashboard-kpi-card">
                <div className="stat-icon yellow">💰</div>
                <div className="stat-info">
                  <div className="stat-label">Monto total facturado</div>
                  <div className="stat-value">${totalMonto.toFixed(2)}</div>
                </div>
              </div>

              {/* Recibidos MH */}
              <div className="stat-card dashboard-kpi-card">
                <div className="stat-icon green">✅</div>
                <div className="stat-info">
                  <div className="stat-label">Recibidos por MH</div>
                  <div className="stat-value">{recibidos?.cantidad ?? 0}</div>
                </div>
              </div>

              {/* Rechazados — rojo si >0, verde si 0 */}
              <div className="stat-card dashboard-kpi-card" style={
                nRechazados > 0 ? {
                  border: '1px solid rgba(239,68,68,0.35)',
                  background: 'rgba(239,68,68,0.06)',
                } : {}
              }>
                <div className={`stat-icon ${nRechazados > 0 ? 'red' : 'green'}`}>
                  {nRechazados > 0 ? '❌' : '✅'}
                </div>
                <div className="stat-info">
                  <div className="stat-label">Rechazados</div>
                  <div className="stat-value" style={{ color: nRechazados > 0 ? '#ef4444' : undefined }}>
                    {nRechazados}
                  </div>
                  {nRechazados > 0 && (
                    <Link to="/dtes?estado=RECHAZADO"
                      style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, textDecoration: 'none' }}>
                      Ver detalle →
                    </Link>
                  )}
                </div>
              </div>

              {/* Tasa de aceptación */}
              {tasaAceptacion !== null && (
                <div className="stat-card dashboard-kpi-card">
                  <div className={`stat-icon ${tasaAceptacion >= 90 ? 'green' : tasaAceptacion >= 70 ? 'yellow' : 'red'}`}>
                    {tasaAceptacion >= 90 ? '📈' : tasaAceptacion >= 70 ? '📊' : '📉'}
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Tasa de aceptación</div>
                    <div className="stat-value"
                      style={{ color: tasaAceptacion >= 90 ? '#10b981' : tasaAceptacion >= 70 ? '#f59e0b' : '#ef4444' }}>
                      {tasaAceptacion}%
                    </div>
                    <div style={{ marginTop: 4, height: 4, borderRadius: 99, background: 'rgba(148,163,184,.2)', overflow: 'hidden', width: '100%' }}>
                      <div style={{
                        height: '100%', borderRadius: 99,
                        width: `${tasaAceptacion}%`,
                        background: tasaAceptacion >= 90 ? '#10b981' : tasaAceptacion >= 70 ? '#f59e0b' : '#ef4444',
                      }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Análisis ──────────────────────────────────────────────────── */}
            <div className="dashboard-section-head dashboard-section-head--charts">
              <h2 className="dashboard-section-title">Análisis</h2>
              <p className="dashboard-section-desc">Distribución por estado, tipo y evolución mensual.</p>
            </div>

            <div className="dashboard-chart-row">
              {/* Donut por estado */}
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
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={3}
                        labelLine={false}
                        label={(props: any) => {
                          const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0, name } = props;
                          const RADIAN = Math.PI / 180;
                          const radius = innerRadius + (outerRadius - innerRadius) * 1.45;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return percent > 0.05 ? (
                            <text x={x} y={y} fill="#94a3b8" textAnchor={x > cx ? 'start' : 'end'}
                              dominantBaseline="central" fontSize={11} fontWeight={600}>
                              {`${name} ${(percent * 100).toFixed(0)}%`}
                            </text>
                          ) : null;
                        }}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={entry.name}
                            fill={ESTADO_COLORS[entry.name] ?? CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, name) => [`${v} docs`, name]}
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                      />
                      <Legend wrapperStyle={{ paddingTop: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Barras por tipo */}
              <div className="table-card dashboard-chart-card">
                <div className="table-header">
                  <span className="table-title">Documentos por tipo</span>
                </div>
                <div className="dashboard-chart-body">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barTipoData} margin={{ top: 16, right: 16, left: 8, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                      <XAxis dataKey="name" tick={axisTick} tickLine={false}
                        axisLine={{ stroke: 'rgba(148,163,184,0.28)' }} />
                      <YAxis tick={axisTick} allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e2e8f0', fontWeight: 600 }} />
                      <Bar dataKey="cantidad" fill={BAR_TIPO} stroke="rgba(15, 23, 42, 0.9)"
                        strokeWidth={1} radius={[6, 6, 0, 0]} maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Evolución mensual */}
            {barMesData.length > 0 && (
              <div className="table-card dashboard-chart-card dashboard-chart-card--full">
                <div className="table-header">
                  <span className="table-title">Facturación últimos 6 meses</span>
                </div>
                <div className="dashboard-chart-body dashboard-chart-body--wide">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barMesData} margin={{ top: 16, right: 18, left: 8, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                      <XAxis dataKey="name" tick={axisTick} tickLine={false}
                        axisLine={{ stroke: 'rgba(148,163,184,0.28)' }} />
                      <YAxis yAxisId="left" orientation="left" tick={axisTick} allowDecimals={false}
                        tickLine={false} axisLine={false} width={40} />
                      <YAxis yAxisId="right" orientation="right" tick={axisTick}
                        tickFormatter={v => `$${v}`} tickLine={false} axisLine={false} width={52} />
                      <Tooltip
                        formatter={(v, name) =>
                          name === 'monto' ? [`$${Number(v).toFixed(2)}`, 'Monto'] : [v, 'Cantidad']
                        }
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
                      />
                      <Legend wrapperStyle={{ paddingTop: 12 }} />
                      <Bar yAxisId="left" dataKey="cantidad" fill={BAR_CANTIDAD}
                        stroke="rgba(15, 23, 42, 0.9)" strokeWidth={1}
                        radius={[6, 6, 0, 0]} name="Cantidad" maxBarSize={44} />
                      <Bar yAxisId="right" dataKey="monto" fill={BAR_MONTO}
                        stroke="rgba(15, 23, 42, 0.35)" strokeWidth={1}
                        radius={[6, 6, 0, 0]} name="Monto ($)" maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── Últimos DTEs emitidos ────────────────────────────────────── */}
            {recientes.length > 0 && (
              <div className="table-card dashboard-table-wrap">
                <div className="table-header">
                  <span className="table-title">Últimos documentos emitidos</span>
                  <Link to="/dtes" className="btn btn-sm btn-outline" style={{ fontSize: 12 }}>
                    Ver todos →
                  </Link>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>N° Control</th>
                      <th>Fecha</th>
                      <th>Receptor</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recientes.map(d => (
                      <tr key={d.id}>
                        <td>
                          <span style={{
                            fontFamily: 'monospace', background: 'var(--bg-subtle)',
                            padding: '2px 7px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                          }}>
                            {TIPO_NOMBRES[d.tipoDte] ?? d.tipoDte}
                          </span>
                        </td>
                        <td>
                          <Link to={`/dtes/${d.id}`} style={{
                            fontFamily: 'monospace', fontSize: 12, color: 'var(--primary)',
                            textDecoration: 'none', fontWeight: 600,
                          }}>
                            {d.numeroControl ?? '—'}
                          </Link>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{d.fechaEmision}</td>
                        <td style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.receptorNombre ?? '—'}
                        </td>
                        <td className="monto">${Number(d.totalPagar ?? 0).toFixed(2)}</td>
                        <td>
                          <span style={{
                            background: `${ESTADO_COLORS[d.estado] ?? '#6b7280'}22`,
                            color: ESTADO_COLORS[d.estado] ?? '#6b7280',
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          }}>
                            {d.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DashboardShortcut({
  to, icon, title, hint, badge,
}: {
  to: string; icon: string; title: string; hint?: string; badge?: number;
}) {
  return (
    <Link to={to} className="dashboard-shortcut">
      <span className="dashboard-shortcut__icon" aria-hidden>{icon}</span>
      <span className="dashboard-shortcut__text">
        <span className="dashboard-shortcut__title">{title}</span>
        {hint && <span className="dashboard-shortcut__hint">{hint}</span>}
      </span>
      {badge != null && <span className="dashboard-shortcut__badge">{badge}</span>}
    </Link>
  );
}
