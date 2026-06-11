import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Suspense, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import apiClient from './api/apiClient';
import { empresaPermiteTipoDte } from './constants/tiposDte';
import { Login } from './pages/login/Login';
import {
  Dashboard,
  DteList,
  DteDetalle,
  NuevoCf,
  NuevoCcf,
  NuevaNre,
  NuevaFexe,
  Contingencia,
  NuevaRetencion,
  NuevaFse,
  NuevaDonacion,
  Reportes,
  Contactos,
  Compras,
  Inventario,
  ConfiguracionPage,
  GestionCorrelativos,
  WhatsappSetup,
  TenantsPage,
  UsuariosSistema,
  ContingenciaGlobal,
  UsuariosPage,
  ConsultaPublicaPage,
  VerificarDte,
  SaludSistema,
  MiPlanPage,
  PagosAdmin,
  ContabilidadPage,
  ExtensionLicenciaPage,
  ExtensionLicenciasAdmin,
  ExtensionStorePage,
  ExtensionPrivacidadPage,
} from './routes/lazyPages';
import { ImpersonacionBanner } from './components/ImpersonacionBanner';
import { DteLimiteProvider } from './components/DteLimiteProvider';
import { PuntoDeVentaModal } from './components/PuntoDeVentaModal';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RouteFallback() {
  return (
    <div className="loading-wrap" style={{ minHeight: '45vh', padding: 48 }}>
      <div className="spinner" />
    </div>
  );
}

function AppLayout() {
  const { usuario, logout, isAdmin, isSuperAdmin, misEmpresas, cambiarEmpresa } = useAuth();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pdvOpen, setPdvOpen] = useState(false);

  // Cierra la sidebar al cambiar de ruta (clic en NavLink en móvil)
  const closeSidebar = () => setSidebarOpen(false);

  // Bloquea scroll del body cuando la sidebar está abierta en móvil
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const { data: colaCount = 0 } = useQuery({
    queryKey: ['contingencia-count'],
    queryFn: () => apiClient.get('/dte/contingencia/cola').then(r => r.data.length),
    refetchInterval: 60_000,
    enabled: !!usuario,
  });

  const { data: empresaPerfil } = useQuery({
    queryKey: ['empresa'],
    queryFn: () => apiClient.get('/empresa').then(r => r.data),
    enabled: !!usuario && !isSuperAdmin,
  });

  const puede = (codigo: string) =>
    empresaPermiteTipoDte(empresaPerfil?.tiposDteHabilitados as string[] | undefined, codigo);

  if (!usuario) return <Navigate to="/login" replace />;

  return (
    <div className="layout">
      {/* ── Topbar móvil (solo visible en pantallas pequeñas) ── */}
      <header className="mobile-topbar">
        <button
          className={`hamburger${sidebarOpen ? ' hamburger--open' : ''}`}
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Abrir menú"
          aria-expanded={sidebarOpen}
        >
          <span />
          <span />
          <span />
        </button>
        <span className="mobile-brand">iFactu</span>
      </header>

      {/* ── Overlay (cierra sidebar al tocar fuera) ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} aria-hidden />
      )}

      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-brand">
          <img
            className="brand-logo-wide"
            src="/ifactu-logo.png?v=4"
            alt="iFactu"
            width={512}
            height={512}
            decoding="async"
          />
          <span className="brand-tagline">El Salvador DTE</span>
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal" onClick={closeSidebar}>

          {/* ── Selector de cliente (CONTADOR con múltiples empresas) ── */}
          {usuario.rol === 'CONTADOR' && misEmpresas.length > 1 && (
            <div className="nav-group">
              <p className="nav-label">Mis Clientes</p>
              {misEmpresas.map(emp => {
                const isActive = emp.id === usuario.empresaId;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (!isActive) cambiarEmpresa(emp.id).catch(() => {});
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      background: isActive ? 'rgba(45,212,191,0.12)' : 'transparent',
                      border: 'none',
                      borderLeft: isActive ? '3px solid #2dd4bf' : '3px solid transparent',
                      borderRadius: '0 6px 6px 0',
                      padding: '8px 12px 8px 13px',
                      color: isActive ? '#2dd4bf' : '#94a3b8',
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s, color 0.15s',
                      marginBottom: 1,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{isActive ? '✓' : '🏢'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {emp.nombre}
                    </span>
                    {isActive && (
                      <span style={{ fontSize: 10, opacity: 0.6, flexShrink: 0 }}>activo</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Punto de Venta (acceso rápido, solo no-admin y no-contador) ── */}
          {!isSuperAdmin && usuario.rol !== 'CONTADOR' && (
            <div className="nav-group">
              <button
                className="pdv-sidebar-btn"
                onClick={e => { e.stopPropagation(); setSidebarOpen(false); setPdvOpen(true); }}
              >
                <span className="nav-icon" aria-hidden>🖥️</span>
                <span>Punto de Venta</span>
                <span className="pdv-sidebar-badge">Rápido</span>
              </button>
            </div>
          )}

          <div className="nav-group">
            <p className="nav-label">Documentos</p>
            <NavLink to="/" end>
              <span className="nav-icon" aria-hidden>📊</span> Dashboard
            </NavLink>
            <NavLink to="/dtes">
              <span className="nav-icon" aria-hidden>📋</span> DTEs Emitidos
            </NavLink>
          </div>

          {isSuperAdmin && (
            <div className="nav-group nav-group--saas">
              <p className="nav-label">Plataforma SaaS</p>
              <NavLink to="/admin/tenants">
                <span className="nav-icon" aria-hidden>🏢</span> Gestionar Empresas
              </NavLink>
              <NavLink to="/admin/usuarios">
                <span className="nav-icon" aria-hidden>👥</span> Usuarios del Sistema
              </NavLink>
              <NavLink to="/admin/contingencia">
                <span className="nav-icon" aria-hidden>⚠️</span> Contingencia Global
              </NavLink>
              <NavLink to="/admin/salud">
                <span className="nav-icon" aria-hidden>🩺</span> Salud del Sistema
              </NavLink>
              <NavLink to="/admin/pagos">
                <span className="nav-icon" aria-hidden>💳</span> Pagos N1CO
              </NavLink>
              <NavLink to="/admin/extension-licencias">
                <span className="nav-icon" aria-hidden>🧩</span> Ext. Licencias
              </NavLink>
              <NavLink to="/configuracion/whatsapp">
                <span className="nav-icon" aria-hidden>💬</span> WhatsApp
              </NavLink>
            </div>
          )}

          {!isSuperAdmin && (
            <>
              {/* CONTADOR no puede emitir DTEs */}
              {usuario.rol !== 'CONTADOR' && (
              <div className="nav-group">
                <p className="nav-label">Emitir DTE</p>
                {puede('01') && (
                  <NavLink to="/cf/nuevo">
                    <span className="nav-icon" aria-hidden>🧾</span> Factura CF
                  </NavLink>
                )}
                {puede('03') && (
                  <NavLink to="/ccf/nuevo">
                    <span className="nav-icon" aria-hidden>📄</span> Crédito Fiscal
                  </NavLink>
                )}
                {puede('04') && (
                  <NavLink to="/nre/nuevo">
                    <span className="nav-icon" aria-hidden>🚚</span> Nota de Remisión
                  </NavLink>
                )}
                {puede('11') && (
                  <NavLink to="/fexe/nuevo">
                    <span className="nav-icon" aria-hidden>🌍</span> F. Exportación
                  </NavLink>
                )}
                {puede('07') && (
                  <NavLink to="/retencion/nuevo">
                    <span className="nav-icon" aria-hidden>🏦</span> Retención
                  </NavLink>
                )}
                {puede('14') && (
                  <NavLink to="/fse/nuevo">
                    <span className="nav-icon" aria-hidden>👤</span> Sujeto Excluido
                  </NavLink>
                )}
                {puede('15') && (
                  <NavLink to="/donacion/nuevo">
                    <span className="nav-icon" aria-hidden>🎁</span> Donación
                  </NavLink>
                )}
              </div>
              )}
              <div className="nav-group">
                <p className="nav-label">Contabilidad</p>
                <NavLink to="/compras">
                  <span className="nav-icon" aria-hidden>🛒</span> Libro Compras
                </NavLink>
                <NavLink to="/inventario">
                  <span className="nav-icon" aria-hidden>📦</span> Inventario
                </NavLink>
                <NavLink to="/contabilidad">
                  <span className="nav-icon" aria-hidden>🏦</span> Contabilidad
                </NavLink>
                <NavLink to="/reportes">
                  <span className="nav-icon" aria-hidden>📒</span> Libros / Anexos
                </NavLink>
                <NavLink to="/contactos">
                  <span className="nav-icon" aria-hidden>👥</span> Contactos
                </NavLink>
              </div>
              {/* Extensión Chrome — solo para CONTADOR */}
              {usuario.rol === 'CONTADOR' && (
                <div className="nav-group">
                  <p className="nav-label">Extensión Chrome</p>
                  <NavLink to="/extension/licencia">
                    <span className="nav-icon" aria-hidden>🧩</span> Mi Licencia
                  </NavLink>
                </div>
              )}

              <div className="nav-group">
                <p className="nav-label">Herramientas</p>
                <NavLink to="/contingencia">
                  <span className="nav-icon" aria-hidden>⚠️</span> Contingencia
                  {colaCount > 0 && <span className="nav-badge danger">{colaCount}</span>}
                </NavLink>
                {isAdmin && (
                  <>
                    <NavLink to="/usuarios">
                      <span className="nav-icon" aria-hidden>🔑</span> Usuarios
                    </NavLink>
                    <NavLink to="/configuracion">
                      <span className="nav-icon" aria-hidden>⚙️</span> Configuración
                    </NavLink>
                    <NavLink to="/configuracion/correlativos">
                      <span className="nav-icon" aria-hidden>🔢</span> Correlativos
                    </NavLink>
                    <NavLink to="/billing/mi-plan">
                      <span className="nav-icon" aria-hidden>💳</span> Mi Plan
                    </NavLink>
                  </>
                )}
              </div>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          {/* ── Empresa activa (CONTADOR con 1 empresa: indicador compacto) ── */}
          {usuario.rol === 'CONTADOR' && misEmpresas.length === 1 && (
            <div style={{ padding: '0 8px 6px' }}>
              <div style={{
                background: 'rgba(45,212,191,0.08)',
                border: '1px solid rgba(45,212,191,0.2)',
                borderRadius: 8,
                padding: '6px 10px',
                color: '#2dd4bf',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span>🏢</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {empresaPerfil?.nombreLegal || misEmpresas[0]?.nombre || 'Cliente activo'}
                </span>
              </div>
            </div>
          )}

          <div style={{ padding: '0 8px 8px' }}>
            <div
              style={{
                background: 'rgba(255,255,255,.06)',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{usuario.nombre}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>{usuario.rol}</div>
              </div>
              <button
                type="button"
                onClick={() => { qc.clear(); logout(); }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}
                aria-label="Cerrar sesión"
              >
                ⏻
              </button>
            </div>
          </div>
          <div className={`env-badge${empresaPerfil?.mhAmbiente === '01' ? ' env-badge--prod' : ''}`}>
            <div className="env-dot" />
            {empresaPerfil?.mhAmbiente === '01' ? 'Ambiente producción (MH)' : 'Ambiente pruebas (MH)'}
          </div>
        </div>
      </aside>

      <ImpersonacionBanner />
      <DteLimiteProvider />
      {/* ── Modal Punto de Venta ── */}
      {pdvOpen && (
        <PuntoDeVentaModal
          tiposHabilitados={empresaPerfil?.tiposDteHabilitados}
          onClose={() => setPdvOpen(false)}
        />
      )}

      <main className="content">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dtes" element={<DteList />} />
            <Route path="/dte/:id" element={<DteDetalle />} />
            <Route path="/cf/nuevo" element={<NuevoCf />} />
            <Route path="/ccf/nuevo" element={<NuevoCcf />} />
            <Route path="/nre/nuevo" element={<NuevaNre />} />
            <Route path="/fexe/nuevo" element={<NuevaFexe />} />
            <Route path="/retencion/nuevo" element={<NuevaRetencion />} />
            <Route path="/fse/nuevo" element={<NuevaFse />} />
            <Route path="/donacion/nuevo" element={<NuevaDonacion />} />
            <Route path="/compras" element={<Compras />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/contabilidad" element={<ContabilidadPage />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/contactos" element={<Contactos />} />
            <Route path="/contingencia" element={<Contingencia />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
            <Route path="/configuracion/correlativos" element={<GestionCorrelativos />} />
            <Route path="/billing/mi-plan" element={<MiPlanPage />} />
            {isSuperAdmin && <Route path="/configuracion/whatsapp" element={<WhatsappSetup />} />}
            {isSuperAdmin && <Route path="/admin/tenants" element={<TenantsPage />} />}
            {isSuperAdmin && <Route path="/admin/usuarios" element={<UsuariosSistema />} />}
            {isSuperAdmin && <Route path="/admin/contingencia" element={<ContingenciaGlobal />} />}
            {isSuperAdmin && <Route path="/admin/salud" element={<SaludSistema />} />}
            {isSuperAdmin && <Route path="/admin/pagos" element={<PagosAdmin />} />}
            {isSuperAdmin && <Route path="/admin/extension-licencias" element={<ExtensionLicenciasAdmin />} />}
            <Route path="/extension/licencia" element={<ExtensionLicenciaPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/extension" element={<ExtensionStorePage />} />
                <Route path="/privacidad-extension" element={<ExtensionPrivacidadPage />} />
                <Route path="/consultar/:id" element={<ConsultaPublicaPage />} />
                <Route path="/verificar/:codigoGeneracion" element={<VerificarDte />} />
                <Route path="/*" element={<AppLayout />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function LoginRoute() {
  const { usuario } = useAuth();
  if (usuario) return <Navigate to="/" replace />;
  return <Login />;
}

export default App;
