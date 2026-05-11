import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Suspense, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
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
} from './routes/lazyPages';
import { ImpersonacionBanner } from './components/ImpersonacionBanner';
import { DteLimiteProvider } from './components/DteLimiteProvider';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [empresaMenuOpen, setEmpresaMenuOpen] = useState(false);

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
          {/* ── Selector de empresa (solo CONTADOR con múltiples empresas) ── */}
          {usuario.rol === 'CONTADOR' && misEmpresas.length > 1 && (
            <div style={{ padding: '0 8px 6px', position: 'relative' }}>
              <button
                type="button"
                onClick={() => setEmpresaMenuOpen(o => !o)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>🏢 {empresaPerfil?.nombreLegal || 'Empresa actual'}</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>{empresaMenuOpen ? '▲' : '▼'}</span>
              </button>
              {empresaMenuOpen && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 8,
                  right: 8,
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  zIndex: 100,
                  marginBottom: 4,
                }}>
                  {misEmpresas.map(emp => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => { setEmpresaMenuOpen(false); cambiarEmpresa(emp.id); }}
                      style={{
                        width: '100%',
                        background: emp.id === usuario.empresaId ? 'rgba(99,102,241,.25)' : 'transparent',
                        border: 'none',
                        padding: '8px 12px',
                        color: '#e2e8f0',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderBottom: '1px solid rgba(255,255,255,.06)',
                      }}
                    >
                      {emp.id === usuario.empresaId ? '✓ ' : '   '}{emp.nombre}
                    </button>
                  ))}
                </div>
              )}
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
                onClick={logout}
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
