import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_BASE } from '../../api/apiClient';

export function Login() {
  const { login, pendingEmpresas, selectEmpresa, cancelarSeleccion } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectingLoading, setSelectingLoading] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // Si no hay pendingEmpresas, login fue exitoso → navegar
      // Si hay pendingEmpresas, el componente mostrará el selector (no navegar aún)
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.error('Login error', err);
      if (!isAxiosError(err)) {
        setError('Error inesperado al iniciar sesión.');
        return;
      }
      if (!err.response) {
        setError(
          `Sin respuesta del API (${API_BASE}). Arranca el backend (Nest) en ese puerto, revisa firewall/VPN, o define VITE_API_URL y reinicia el frontend. Si el navegador bloquea la petición, revisa CORS en el servidor.`,
        );
      } else if (err.response.status === 401) {
        setError('Correo o contraseña incorrectos');
      } else {
        const st = err.response.status;
        const msg =
          err.response.data && typeof err.response.data === 'object' && 'message' in err.response.data
            ? String((err.response.data as { message?: unknown }).message)
            : 'Error desconocido';
        setError(`Fallo del servidor (${st}): ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEmpresa = async (empresaId: string) => {
    setSelectingLoading(empresaId);
    try {
      await selectEmpresa(empresaId);
      navigate('/');
    } catch {
      setError('Error al seleccionar empresa. Intenta de nuevo.');
      cancelarSeleccion();
    } finally {
      setSelectingLoading(null);
    }
  };

  const card = (
    <div className="login-page__card">
      <header className="login-page__brand">
        <div className="login-page__logo-wrap">
          <img
            className="login-page__logo"
            src="/ifactu-logo.png?v=4"
            alt="iFactu by NEXA"
          />
        </div>
      </header>

      {/* ── PANTALLA: Selector de empresa ── */}
      {pendingEmpresas ? (
        <div>
          <p style={{ marginBottom: 16, color: 'var(--text-2)', fontSize: 14 }}>
            Tu cuenta tiene acceso a varias empresas. Selecciona con cuál deseas trabajar:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingEmpresas.map(emp => (
              <button
                key={emp.id}
                className="btn btn-primary"
                style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                disabled={!!selectingLoading}
                onClick={() => handleSelectEmpresa(emp.id)}
              >
                {selectingLoading === emp.id ? '⏳ ' : '🏢 '}
                {emp.nombre}
              </button>
            ))}
          </div>
          <button
            className="btn"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => { cancelarSeleccion(); setError(''); }}
          >
            ← Volver al login
          </button>
          {error && (
            <div className="alert alert-error login-page__error" role="alert">
              {error}
            </div>
          )}
        </div>
      ) : (
        /* ── PANTALLA: Formulario de login ── */
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Correo electrónico
            </label>
            <input
              id="login-email"
              className="form-control"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Contraseña
            </label>
            <input
              id="login-password"
              className="form-control"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="alert alert-error login-page__error" role="alert">
              {error}
            </div>
          )}

          <button
            className="btn btn-primary login-page__submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-page__aurora" aria-hidden />
      <div className="login-page__grain" aria-hidden />
      {card}
    </div>
  );
}
