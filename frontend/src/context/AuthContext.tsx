import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import { API_BASE } from '../api/apiClient';

/** Misma base que `apiClient` (VITE_API_URL o http://127.0.0.1:3002/api) */
const API = API_BASE.replace(/\/$/, '');

export interface UsuarioAuth {
  id: string;
  email: string;
  nombre: string;
  rol: 'ADMIN' | 'CONTADOR' | 'EMISOR' | 'SUPERADMIN';
  empresaId?: string | null;
  impersonando?: boolean;
}

export interface EmpresaOpcion {
  id: string;
  nombre: string;
}

interface AuthCtx {
  usuario: UsuarioAuth | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isContador: boolean;
  isSuperAdmin: boolean;
  impersonando: boolean;
  empresaImpersonada: string | null;
  iniciarImpersonacion: (token: string, usuario: UsuarioAuth) => void;
  salirImpersonacion: () => void;
  // Multi-empresa para CONTADOR
  pendingEmpresas: EmpresaOpcion[] | null;
  pendingSelectionToken: string | null;
  selectEmpresa: (empresaId: string) => Promise<void>;
  cancelarSeleccion: () => void;
  misEmpresas: EmpresaOpcion[];
  cambiarEmpresa: (empresaId: string) => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

/** Decodifica la parte payload de un JWT sin verificación (solo lectura cliente) */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1];
    return JSON.parse(atob(base64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAuth | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [pendingEmpresas, setPendingEmpresas] = useState<EmpresaOpcion[] | null>(null);
  const [pendingSelectionToken, setPendingSelectionToken] = useState<string | null>(null);
  const [misEmpresas, setMisEmpresas] = useState<EmpresaOpcion[]>([]);

  // Restaurar sesión del localStorage
  useEffect(() => {
    const t = localStorage.getItem('dte_token');
    const u = localStorage.getItem('dte_usuario');
    if (t && u) {
      setToken(t);
      const parsed = JSON.parse(u) as UsuarioAuth;
      // Verify impersonando flag from token payload
      const payload = decodeJwtPayload(t);
      if (payload?.impersonando) {
        parsed.impersonando = true;
      }
      setUsuario(parsed);
      axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    }
  }, []);

  // Cuando el usuario es CONTADOR, cargar lista de sus empresas
  useEffect(() => {
    if (usuario?.rol === 'CONTADOR' && token) {
      axios.get(`${API}/auth/mis-empresas`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => setMisEmpresas(r.data)).catch(() => setMisEmpresas([]));
    } else {
      setMisEmpresas([]);
    }
  }, [usuario?.id, token]);

  const login = async (email: string, password: string) => {
    devLog(`Intentando login para: ${email} en ${API}/auth/login`);
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    devLog('Login response', data);

    // CONTADOR con múltiples empresas → requiere selección
    if (data.requires_empresa_selection) {
      setPendingEmpresas(data.empresas);
      setPendingSelectionToken(data.selection_token);
      return;
    }

    setToken(data.access_token);
    setUsuario(data.usuario);
    localStorage.setItem('dte_token', data.access_token);
    localStorage.setItem('dte_usuario', JSON.stringify(data.usuario));
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
  };

  /** Contador selecciona su empresa después de ingresar credenciales */
  const selectEmpresa = async (empresaId: string) => {
    if (!pendingSelectionToken) return;
    const { data } = await axios.post(`${API}/auth/select-empresa`, {
      selection_token: pendingSelectionToken,
      empresaId,
    });
    setPendingEmpresas(null);
    setPendingSelectionToken(null);
    setToken(data.access_token);
    setUsuario(data.usuario);
    localStorage.setItem('dte_token', data.access_token);
    localStorage.setItem('dte_usuario', JSON.stringify(data.usuario));
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
  };

  const cancelarSeleccion = () => {
    setPendingEmpresas(null);
    setPendingSelectionToken(null);
  };

  /** Contador cambia de empresa durante la sesión */
  const cambiarEmpresa = async (empresaId: string) => {
    if (!token) return;
    const { data } = await axios.post(
      `${API}/auth/cambiar-empresa`,
      { empresaId },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    setToken(data.access_token);
    setUsuario(data.usuario);
    localStorage.setItem('dte_token', data.access_token);
    localStorage.setItem('dte_usuario', JSON.stringify(data.usuario));
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
    // Recargar página para que React Query invalide todo el caché
    window.location.href = '/';
  };

  const logout = () => {
    setToken(null);
    setUsuario(null);
    localStorage.removeItem('dte_token');
    localStorage.removeItem('dte_usuario');
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_usuario');
    delete axios.defaults.headers.common['Authorization'];
  };

  /** Inicia impersonación: guarda el token del superadmin y activa el token de la empresa */
  const iniciarImpersonacion = (newToken: string, newUsuario: UsuarioAuth) => {
    const currentToken = localStorage.getItem('dte_token');
    const currentUsuario = localStorage.getItem('dte_usuario');
    if (currentToken) localStorage.setItem('sa_token', currentToken);
    if (currentUsuario) localStorage.setItem('sa_usuario', currentUsuario);

    setToken(newToken);
    setUsuario({ ...newUsuario, impersonando: true });
    localStorage.setItem('dte_token', newToken);
    localStorage.setItem('dte_usuario', JSON.stringify({ ...newUsuario, impersonando: true }));
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  /** Sale de la impersonación restaurando el token del superadmin */
  const salirImpersonacion = () => {
    const saToken = localStorage.getItem('sa_token');
    const saUsuario = localStorage.getItem('sa_usuario');
    if (saToken && saUsuario) {
      setToken(saToken);
      setUsuario(JSON.parse(saUsuario));
      localStorage.setItem('dte_token', saToken);
      localStorage.setItem('dte_usuario', saUsuario);
      axios.defaults.headers.common['Authorization'] = `Bearer ${saToken}`;
    } else {
      // Fallback: logout completo
      logout();
    }
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_usuario');
  };

  const isImpersonando = !!(usuario?.impersonando);

  return (
    <AuthContext.Provider value={{
      usuario, token, login, logout,
      isAdmin:    usuario?.rol === 'ADMIN' || usuario?.rol === 'SUPERADMIN',
      isContador: usuario?.rol === 'ADMIN' || usuario?.rol === 'CONTADOR' || usuario?.rol === 'SUPERADMIN',
      isSuperAdmin: usuario?.rol === 'SUPERADMIN',
      impersonando: isImpersonando,
      empresaImpersonada: isImpersonando ? (usuario?.empresaId ?? null) : null,
      iniciarImpersonacion,
      salirImpersonacion,
      pendingEmpresas,
      pendingSelectionToken,
      selectEmpresa,
      cancelarSeleccion,
      misEmpresas,
      cambiarEmpresa,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
