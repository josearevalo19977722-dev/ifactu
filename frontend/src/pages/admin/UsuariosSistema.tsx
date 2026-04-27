import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

interface UsuarioSistema {
  id:        string;
  nombre:    string;
  email:     string;
  rol:       string;
  activo:    boolean;
  createdAt: string;
  empresa:   { id: string; nombreLegal: string } | null;
}

const ROL_BADGE: Record<string, { bg: string; color: string }> = {
  SUPERADMIN: { bg: '#e9d5ff', color: '#5b21b6' },
  ADMIN:      { bg: '#fecaca', color: '#7f1d1d' },
  CONTADOR:   { bg: '#fde68a', color: '#78350f' },
  EMISOR:     { bg: '#bfdbfe', color: '#1e40af' },
};

interface EditForm {
  nombre:   string;
  email:    string;
  password: string;
}

const EMPTY_FORM: EditForm = { nombre: '', email: '', password: '' };

export function UsuariosSistema() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda]       = useState('');
  const [editando, setEditando]       = useState<UsuarioSistema | null>(null);
  const [form, setForm]               = useState<EditForm>(EMPTY_FORM);
  const [mostrarPw, setMostrarPw]     = useState(false);
  const [errorModal, setErrorModal]   = useState('');

  const { data: usuarios = [], isLoading } = useQuery<UsuarioSistema[]>({
    queryKey: ['superadmin-usuarios'],
    queryFn:  () => apiClient.get('/auth/superadmin/usuarios').then(r => r.data),
  });

  const actualizarMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EditForm> }) =>
      apiClient.patch(`/auth/superadmin/usuarios/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-usuarios'] });
      setEditando(null);
      setForm(EMPTY_FORM);
      setErrorModal('');
    },
    onError: (e: any) => {
      setErrorModal(e?.response?.data?.message ?? 'Error al actualizar');
    },
  });

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const filtrados = usuarios.filter((u) => {
    const q = busqueda.toLowerCase();
    return (
      u.nombre.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.empresa?.nombreLegal ?? '').toLowerCase().includes(q)
    );
  });

  // ── Abrir modal edición ───────────────────────────────────────────────────
  function abrirEditar(u: UsuarioSistema) {
    setEditando(u);
    setForm({ nombre: u.nombre, email: u.email, password: '' });
    setMostrarPw(false);
    setErrorModal('');
  }

  function guardar() {
    if (!editando) return;
    const body: Partial<EditForm> = {};
    if (form.nombre.trim() && form.nombre.trim() !== editando.nombre) body.nombre = form.nombre.trim();
    if (form.email.trim() && form.email.trim() !== editando.email)   body.email  = form.email.trim();
    if (form.password.trim()) body.password = form.password.trim();

    if (Object.keys(body).length === 0) { setEditando(null); return; }
    actualizarMut.mutate({ id: editando.id, body });
  }

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">Usuarios del Sistema</span>
      </div>

      <div className="page">
        {/* Buscador + contador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <input
            className="form-control"
            style={{ maxWidth: 320 }}
            placeholder="Buscar por nombre, correo o empresa…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <span style={{ color: 'var(--text-2)', fontSize: '.875rem' }}>
            {filtrados.length} usuario{filtrados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tabla */}
        <div className="table-card">
          {isLoading ? (
            <div className="loading-wrap"><div className="spinner" /></div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Empresa</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                    Sin resultados
                  </td></tr>
                ) : filtrados.map((u) => {
                  const badge = ROL_BADGE[u.rol] ?? { bg: '#e5e7eb', color: '#374151' };
                  return (
                    <tr key={u.id}>
                      <td className="text-main">{u.nombre}</td>
                      <td className="mono" style={{ fontSize: '.85rem' }}>{u.email}</td>
                      <td style={{ color: 'var(--text-2)', fontSize: '.875rem' }}>
                        {u.empresa?.nombreLegal ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td>
                        <span className="tipo-pill" style={{ background: badge.bg, color: badge.color }}>
                          {u.rol}
                        </span>
                      </td>
                      <td>
                        <span className={`tipo-pill ${u.activo ? '' : 'tipo-pill--danger'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => abrirEditar(u)}
                        >
                          ✏️ Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Modal edición ── */}
      {editando && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditando(null); }}
        >
          <div style={{
            background: 'var(--surface)',
            borderRadius: 12,
            padding: 28,
            width: '100%',
            maxWidth: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,.3)',
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>Editar usuario</h3>
            <p style={{ margin: '0 0 20px', fontSize: '.85rem', color: 'var(--text-2)' }}>
              {editando.empresa?.nombreLegal ?? 'Sin empresa'} · {editando.rol}
            </p>

            {errorModal && (
              <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                {errorModal}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input
                className="form-control"
                value={form.nombre}
                onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre completo"
              />
            </div>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Correo electrónico</label>
              <input
                className="form-control"
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="correo@empresa.com"
              />
            </div>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Nueva contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-control"
                  type={mostrarPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Dejar vacío para no cambiarla"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setMostrarPw(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                    color: 'var(--text-2)',
                  }}
                >
                  {mostrarPw ? '🙈' : '👁️'}
                </button>
              </div>
              <p style={{ fontSize: '.8rem', color: 'var(--text-3)', marginTop: 4 }}>
                Mínimo 6 caracteres. Déjalo vacío si no quieres cambiarla.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={guardar}
                disabled={actualizarMut.isPending}
              >
                {actualizarMut.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
