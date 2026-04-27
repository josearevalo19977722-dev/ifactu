import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_BASE } from '../../api/apiClient';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
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

  return (
    <div className="login-page">
      <div className="login-page__aurora" aria-hidden />
      <div className="login-page__grain" aria-hidden />

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
      </div>
    </div>
  );
}
