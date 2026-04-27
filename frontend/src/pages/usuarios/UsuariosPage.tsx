import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal';
import type { CrearUsuarioPayload, UsuarioSistema } from '../../types/auth';

/** Fondo pastel + texto oscuro (evita gris claro heredado de .table) */
const ROL_BADGE: Record<string, { bg: string; color: string }> = {
  SUPERADMIN: { bg: '#e9d5ff', color: '#5b21b6' },
  ADMIN: { bg: '#fecaca', color: '#7f1d1d' },
  CONTADOR: { bg: '#fde68a', color: '#78350f' },
  EMISOR: { bg: '#bfdbfe', color: '#1e40af' },
};

export function UsuariosPage() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UsuarioSistema | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => apiClient.get<UsuarioSistema[]>('/auth/usuarios').then(r => r.data),
    enabled: isAdmin,
  });

  const crearMut = useMutation({
    mutationFn: (d: CrearUsuarioPayload) => apiClient.post('/auth/usuarios', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      setModalOpen(false);
    },
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/auth/usuarios/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  const resetPassMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiClient.patch(`/auth/usuarios/${id}/password`, { password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      setResetUser(null);
      setResetPassword('');
    },
  });

  const [form, setForm] = useState<CrearUsuarioPayload>({
    email: '',
    nombre: '',
    password: '',
    rol: 'EMISOR',
  });

  if (!isAdmin) {
    return (
      <div className="page" style={{ padding: 28 }}>
        <div className="alert alert-error">⛔ Acceso denegado</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className={`topbar ${isSuperAdmin ? 'topbar--superadmin' : ''}`}>
        <div className="topbar-head">
          <span className="topbar-title">Usuarios del sistema</span>
          {isSuperAdmin && (
            <p className="topbar-subtitle">
              Cuentas globales, roles y acceso a empresas de la plataforma.
            </p>
          )}
        </div>
        <button
          type="button"
          className={`btn btn-primary ${isSuperAdmin ? 'btn--superadmin-cta' : 'btn-sm'}`}
          onClick={() => setModalOpen(true)}
        >
          + Nuevo usuario
        </button>
      </div>
      <div className="superadmin-table-wrap">
        <div className="table-card">
          {isLoading ? (
            <div className="loading-wrap">
              <div className="spinner" />
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                    <td>{u.email}</td>
                    <td>
                      <span
                        className="table-type-pill"
                        style={{
                          background: ROL_BADGE[u.rol]?.bg ?? '#e2e8f0',
                          color: ROL_BADGE[u.rol]?.color ?? '#0f172a',
                        }}
                      >
                        {u.rol}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          color: u.activo ? '#10b981' : '#ef4444',
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {u.activo ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                        {isSuperAdmin && u.rol !== 'SUPERADMIN' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setResetUser(u);
                              setResetPassword('');
                            }}
                          >
                            Nueva contraseña
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => toggleMut.mutate(u.id)}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        open={!!resetUser}
        onClose={() => {
          setResetUser(null);
          setResetPassword('');
        }}
        title={resetUser ? `Contraseña — ${resetUser.email}` : 'Contraseña'}
        maxWidth={420}
        footer={
          resetUser ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={resetPassMut.isPending || resetPassword.length < 6}
                onClick={() =>
                  resetPassMut.mutate({ id: resetUser.id, password: resetPassword })
                }
              >
                {resetPassMut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setResetUser(null);
                  setResetPassword('');
                }}
              >
                Cancelar
              </button>
            </>
          ) : null
        }
      >
        {resetUser && (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Define una contraseña nueva para este usuario (mín. 6 caracteres).
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="reset-pass">
                Nueva contraseña
              </label>
              <input
                id="reset-pass"
                className="form-control"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {resetPassMut.isError && (
              <p className="alert alert-error" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                No se pudo actualizar. Revisa permisos o sesión.
              </p>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo usuario"
        maxWidth={420}
        footer={
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => crearMut.mutate(form)}
              disabled={crearMut.isPending}
            >
              {crearMut.isPending ? 'Creando...' : 'Crear usuario'}
            </button>
            <button type="button" className="btn" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label" htmlFor="nu-nombre">
            Nombre
          </label>
          <input
            id="nu-nombre"
            className="form-control"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            autoComplete="name"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="nu-email">
            Correo
          </label>
          <input
            id="nu-email"
            className="form-control"
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            autoComplete="email"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="nu-pass">
            Contraseña
          </label>
          <input
            id="nu-pass"
            className="form-control"
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="nu-rol">
            Rol
          </label>
          <select
            id="nu-rol"
            className="form-control"
            value={form.rol}
            onChange={e => setForm({ ...form, rol: e.target.value })}
          >
            <option value="ADMIN">Admin — acceso total</option>
            <option value="CONTADOR">Contador — reportes y libros</option>
            <option value="EMISOR">Emisor — solo emitir DTEs</option>
          </select>
        </div>
      </Modal>
    </div>
  );
}
