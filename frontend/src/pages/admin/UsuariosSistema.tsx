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

interface EmpresaOpcion {
  id:          string;
  nombre?:     string;   // GET /auth/superadmin/usuarios/:id/empresas
  nombreLegal?: string;  // GET /admin/tenants
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
  const [busqueda, setBusqueda]         = useState('');
  const [editando, setEditando]         = useState<UsuarioSistema | null>(null);
  const [form, setForm]                 = useState<EditForm>(EMPTY_FORM);
  const [mostrarPw, setMostrarPw]       = useState(false);
  const [errorModal, setErrorModal]     = useState('');
  // Modal gestión empresas contador
  const [gestionando, setGestionando]   = useState<UsuarioSistema | null>(null);

  const { data: usuarios = [], isLoading } = useQuery<UsuarioSistema[]>({
    queryKey: ['superadmin-usuarios'],
    queryFn:  () => apiClient.get('/auth/superadmin/usuarios').then(r => r.data),
  });

  // Empresas asignadas al contador seleccionado
  const { data: empresasContador = [], refetch: refetchEmpresasContador } = useQuery<EmpresaOpcion[]>({
    queryKey: ['contador-empresas', gestionando?.id],
    queryFn:  () => apiClient.get(`/auth/superadmin/usuarios/${gestionando!.id}/empresas`).then(r => r.data),
    enabled:  !!gestionando,
  });

  // Todas las empresas del sistema (para el selector)
  const { data: todasEmpresas = [] } = useQuery<EmpresaOpcion[]>({
    queryKey: ['todas-empresas'],
    queryFn:  () => apiClient.get('/admin/tenants').then(r => r.data),
    enabled:  !!gestionando,
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

  const asignarMut = useMutation({
    mutationFn: ({ usuarioId, empresaId }: { usuarioId: string; empresaId: string }) =>
      apiClient.post(`/auth/superadmin/usuarios/${usuarioId}/empresas/${empresaId}`).then(r => r.data),
    onSuccess: () => refetchEmpresasContador(),
  });

  const quitarMut = useMutation({
    mutationFn: ({ usuarioId, empresaId }: { usuarioId: string; empresaId: string }) =>
      apiClient.post(`/auth/superadmin/usuarios/${usuarioId}/empresas/${empresaId}/quitar`).then(r => r.data),
    onSuccess: () => refetchEmpresasContador(),
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

  // Empresas disponibles (no asignadas aún) para el select
  const asignadasIds = new Set(empresasContador.map(e => e.id));
  const disponibles  = todasEmpresas.filter(e => !asignadasIds.has(e.id));

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
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => abrirEditar(u)}
                        >
                          ✏️ Editar
                        </button>
                        {u.rol === 'CONTADOR' && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--primary)' }}
                            onClick={() => setGestionando(u)}
                          >
                            🏢 Empresas
                          </button>
                        )}
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

      {/* ── Modal gestión de empresas del CONTADOR ── */}
      {gestionando && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setGestionando(null); }}
        >
          <div style={{
            background: 'var(--surface)',
            borderRadius: 12,
            padding: 28,
            width: '100%',
            maxWidth: 500,
            boxShadow: '0 20px 60px rgba(0,0,0,.3)',
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>
              🏢 Empresas del contador
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '.85rem', color: 'var(--text-2)' }}>
              {gestionando.nombre} — {gestionando.email}
            </p>

            {/* Lista de empresas ya asignadas */}
            <p style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Empresas asignadas
            </p>
            {empresasContador.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '.875rem', marginBottom: 16 }}>
                Sin empresas asignadas aún.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {empresasContador.map(emp => (
                  <div
                    key={emp.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--surface-2, rgba(0,0,0,.04))',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                  >
                    <span style={{ fontSize: '.9rem' }}>🏢 {emp.nombreLegal || emp.nombre}</span>
                    <button
                      className="btn btn-sm"
                      style={{ color: 'var(--danger, #ef4444)', background: 'none', border: '1px solid var(--danger, #ef4444)', padding: '2px 10px' }}
                      disabled={quitarMut.isPending}
                      onClick={() => quitarMut.mutate({ usuarioId: gestionando.id, empresaId: emp.id })}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Selector para agregar nueva empresa */}
            {disponibles.length > 0 && (
              <>
                <p style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Agregar empresa
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    id="select-nueva-empresa"
                    className="form-control"
                    defaultValue=""
                  >
                    <option value="" disabled>Selecciona una empresa…</option>
                    {disponibles.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombreLegal || emp.nombre}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    disabled={asignarMut.isPending}
                    onClick={() => {
                      const sel = (document.getElementById('select-nueva-empresa') as HTMLSelectElement).value;
                      if (!sel) return;
                      asignarMut.mutate({ usuarioId: gestionando.id, empresaId: sel });
                      (document.getElementById('select-nueva-empresa') as HTMLSelectElement).value = '';
                    }}
                  >
                    {asignarMut.isPending ? '…' : '+ Agregar'}
                  </button>
                </div>
              </>
            )}

            {disponibles.length === 0 && empresasContador.length > 0 && (
              <p style={{ fontSize: '.875rem', color: 'var(--text-3)', marginTop: 8 }}>
                ✅ Este contador ya tiene acceso a todas las empresas disponibles.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button className="btn btn-primary" onClick={() => setGestionando(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
