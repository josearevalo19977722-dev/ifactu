import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';
import { CODIGOS_TIPO_DTE_TODOS, OPCIONES_TIPO_DTE } from '../../constants/tiposDte';
import { useAuth } from '../../context/AuthContext';
import { ACTIVIDADES_ECONOMICAS } from '../../catalogs/actividades';
import { DEPARTAMENTOS, getMunicipios } from '../../catalogs/departamentos';

// Hook para cargar los planes disponibles desde la BD
function usePlanesConfig() {
  return useQuery({
    queryKey: ['admin-planes-config'],
    queryFn: () => apiClient.get('/billing/admin/planes-config').then(r => r.data as any[]),
    staleTime: 60_000,
  });
}

const AMBIENTES: Record<string, string> = { '00': 'Pruebas', '01': 'Producción' };

const EMPTY_CREATE = {
  nombreLegal: '',
  nit: '',
  nrc: '',
  correo: '',
  telefono: '',
  codActividad: '',
  descActividad: '',
  adminEmail: '',
  adminNombre: '',
  adminPassword: '',
  tiposDteHabilitados: [...CODIGOS_TIPO_DTE_TODOS] as string[],
};

function fmt(n: number) { return `$${Number(n || 0).toFixed(2)}`; }

const TIPO_LABEL: Record<string, string> = {
  '01': 'Factura CF', '03': 'CCF', '05': 'Nota Crédito', '06': 'Nota Débito',
  '11': 'Factura Exportación', '14': 'Sujeto Excluido',
};

const OPCION_LABEL = Object.fromEntries(OPCIONES_TIPO_DTE.map(o => [o.codigo, o.label]));

function inicialesEmpresa(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (partes.length === 0) return '?';
  return partes.map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

/** API: null / [] = sin restricción; lista completa = mismo efecto que “todos”. */
function resumenTiposDte(
  tipos: string[] | null | undefined,
): { kind: 'all' } | { kind: 'list'; codes: string[] } {
  if (!tipos || tipos.length === 0) return { kind: 'all' };
  const set = new Set(tipos);
  if (CODIGOS_TIPO_DTE_TODOS.every(c => set.has(c))) return { kind: 'all' };
  return { kind: 'list', codes: [...tipos].sort((a, b) => a.localeCompare(b)) };
}

export function TenantsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { iniciarImpersonacion } = useAuth();
  const [impersonandoId, setImpersonandoId] = useState<string | null>(null);

  const { data: planesConfig = [] } = usePlanesConfig();

  // ── Estado modales ────────────────────────────────────────────────────────
  const [createModal, setCreateModal] = useState(false);
  const [editTenant,  setEditTenant]  = useState<any | null>(null);
  const [statsTenant, setStatsTenant] = useState<any | null>(null);
  const [planTenant,  setPlanTenant]  = useState<any | null>(null);
  const [planForm,    setPlanForm]    = useState({ planTipo: 'BASICA', meses: 1 });
  const [planMsg,     setPlanMsg]     = useState<string | null>(null);

  const [createForm, setCreateForm] = useState(() => ({ ...EMPTY_CREATE }));

  const [editForm, setEditForm] = useState<any>({});

  // ── Usuarios de empresa ───────────────────────────────────────────────────
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<any[]>([]);
  const [nuevoUsuario, setNuevoUsuario] = useState({ email: '', nombre: '', password: '', rol: 'ADMIN' });
  const [nuevoUsuarioMsg, setNuevoUsuarioMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [creandoUsuario, setCreandoUsuario] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.get('/admin/tenants').then(r => r.data),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['tenant-stats', statsTenant?.id],
    queryFn: () => apiClient.get(`/admin/tenants/${statsTenant.id}/stats`).then(r => r.data),
    enabled: !!statsTenant,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data: any) => apiClient.post('/admin/tenants', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setCreateModal(false); },
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => apiClient.put(`/admin/tenants/${editTenant.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setEditTenant(null); },
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/admin/tenants/${id}/status`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  });

  const asignarPlanMut = useMutation({
    mutationFn: (data: { empresaId: string; planTipo: string; meses: number }) =>
      apiClient.post('/billing/admin/asignar-plan', data).then(r => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      setPlanMsg(data.mensaje ?? 'Plan asignado correctamente');
    },
  });

  async function entrarComoEmpresa(empresaId: string) {
    try {
      setImpersonandoId(empresaId);
      const { data } = await apiClient.post(`/auth/superadmin/impersonar/${empresaId}`);
      iniciarImpersonacion(data.access_token, data.usuario);
      navigate('/');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'No se pudo iniciar impersonación');
    } finally {
      setImpersonandoId(null);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function abrirEditar(t: any) {
    setEditForm({
      nombreLegal: t.nombreLegal ?? '',
      nombreComercial: t.nombreComercial ?? '',
      nit: t.nit ?? '',
      nrc: t.nrc ?? '',
      correo: t.correo ?? '',
      telefono: t.telefono ?? '',
      codActividad: t.codActividad ?? '',
      descActividad: t.descActividad ?? '',
      departamento: t.departamento ?? '',
      municipio: t.municipio ?? '',
      complemento: t.complemento ?? '',
      activo: t.activo ?? true,
      pagoAlDia: t.pagoAlDia ?? true,
      esAgenteRetencion: t.esAgenteRetencion ?? false,
      mhAmbiente: t.mhAmbiente ?? '00',
      mhPasswordCert: t.mhPasswordCert ?? '',
      mhApiKey: t.mhApiKey ?? '',
      tiposDteHabilitados:
        Array.isArray(t.tiposDteHabilitados) && t.tiposDteHabilitados.length > 0
          ? [...t.tiposDteHabilitados]
          : [...CODIGOS_TIPO_DTE_TODOS],
    });
    setEditTenant(t);
    setNuevoUsuario({ email: '', nombre: '', password: '', rol: 'ADMIN' });
    setNuevoUsuarioMsg(null);
    apiClient.get(`/auth/superadmin/empresas/${t.id}/usuarios`)
      .then(r => setUsuariosEmpresa(r.data))
      .catch(() => setUsuariosEmpresa([]));
  }

  async function crearUsuarioEmpresa() {
    if (!editTenant) return;
    if (!nuevoUsuario.email || !nuevoUsuario.nombre || !nuevoUsuario.password) {
      setNuevoUsuarioMsg({ ok: false, texto: 'Completa todos los campos' });
      return;
    }
    setCreandoUsuario(true);
    try {
      await apiClient.post(`/auth/superadmin/empresas/${editTenant.id}/usuarios`, nuevoUsuario);
      setNuevoUsuarioMsg({ ok: true, texto: 'Usuario creado correctamente' });
      setNuevoUsuario({ email: '', nombre: '', password: '', rol: 'ADMIN' });
      const r = await apiClient.get(`/auth/superadmin/empresas/${editTenant.id}/usuarios`);
      setUsuariosEmpresa(r.data);
    } catch (err: any) {
      setNuevoUsuarioMsg({ ok: false, texto: err?.response?.data?.message ?? 'Error al crear usuario' });
    } finally {
      setCreandoUsuario(false);
    }
  }

  function toggleTipoCreate(codigo: string) {
    setCreateForm(f => {
      const cur = f.tiposDteHabilitados ?? [];
      const set = new Set(cur);
      if (set.has(codigo)) {
        if (set.size <= 1) return f;
        set.delete(codigo);
      } else {
        set.add(codigo);
      }
      return { ...f, tiposDteHabilitados: [...set] };
    });
  }

  function toggleTipoEdit(codigo: string) {
    setEditForm((f: Record<string, unknown>) => {
      const cur = (f.tiposDteHabilitados as string[]) ?? [];
      const set = new Set(cur);
      if (set.has(codigo)) {
        if (set.size <= 1) return f;
        set.delete(codigo);
      } else {
        set.add(codigo);
      }
      return { ...f, tiposDteHabilitados: [...set] };
    });
  }

  function marcarTodosTiposCreate() {
    setCreateForm(f => ({ ...f, tiposDteHabilitados: [...CODIGOS_TIPO_DTE_TODOS] }));
  }

  function soloFacturaCfCreate() {
    setCreateForm(f => ({ ...f, tiposDteHabilitados: ['01'] }));
  }

  function marcarTodosTiposEdit() {
    setEditForm((f: Record<string, unknown>) => ({
      ...f,
      tiposDteHabilitados: [...CODIGOS_TIPO_DTE_TODOS],
    }));
  }

  function soloFacturaCfEdit() {
    setEditForm((f: Record<string, unknown>) => ({ ...f, tiposDteHabilitados: ['01'] }));
  }

  return (
    <div className="page">
      <div className="topbar topbar--superadmin">
        <div className="topbar-head">
          <span className="topbar-title">Gestión de empresas</span>
          <p className="topbar-subtitle">
            Alta de inquilinos, credenciales MH y tipos de DTE permitidos por empresa.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn--superadmin-cta"
          onClick={() => {
            setCreateForm({ ...EMPTY_CREATE, tiposDteHabilitados: [...CODIGOS_TIPO_DTE_TODOS] });
            setCreateModal(true);
          }}
        >
          + Nueva empresa
        </button>
      </div>

      <div className="tenant-grid">
        {isLoading ? (
          <div className="loading-wrap" style={{ gridColumn: '1 / -1' }}><div className="spinner" /></div>
        ) : tenants.length === 0 ? (
          <div className="tenant-empty">
            <div className="tenant-empty__icon" aria-hidden>🏢</div>
            <h2 className="tenant-empty__title">Aún no hay empresas registradas</h2>
            <p className="tenant-empty__desc">
              Crea la primera empresa para asignar un administrador y definir qué comprobantes podrá emitir.
            </p>
          </div>
        ) : (
          tenants.map((t: any) => {
            const tiposRes = resumenTiposDte(t.tiposDteHabilitados);
            return (
              <article key={t.id} className="tenant-card">
                <div className="tenant-card__head">
                  <div className="tenant-card__title">
                    <div className="tenant-card__avatar" aria-hidden>
                      {inicialesEmpresa(t.nombreLegal ?? '')}
                    </div>
                    <h2 className="tenant-card__name">{t.nombreLegal}</h2>
                  </div>
                  <button
                    type="button"
                    className={`tenant-card__badge ${t.activo ? 'tenant-card__badge--on' : 'tenant-card__badge--off'}`}
                    title="Clic para activar o desactivar"
                    onClick={() => toggleMut.mutate(t.id)}
                  >
                    {t.activo ? 'Activa' : 'Inactiva'}
                  </button>
                </div>
                <div className="tenant-card__body">
                  <dl className="tenant-dl">
                    <div>
                      <dt>NIT</dt>
                      <dd className="mono">{t.nit}</dd>
                    </div>
                    <div>
                      <dt>NRC</dt>
                      <dd className="mono">{t.nrc}</dd>
                    </div>
                    <div>
                      <dt>Correo</dt>
                      <dd>{t.correo}</dd>
                    </div>
                    <div>
                      <dt>Teléfono</dt>
                      <dd>{t.telefono}</dd>
                    </div>
                    <div>
                      <dt>Ambiente</dt>
                      <dd>{AMBIENTES[t.mhAmbiente] ?? t.mhAmbiente}</dd>
                    </div>
                  </dl>
                  <div className="tenant-card__dte">
                    <div className="tenant-card__dte-label">Tipos DTE</div>
                    <div className="dte-chip-row">
                      {tiposRes.kind === 'all' ? (
                        <span className="dte-chip dte-chip--all">Todos los tipos</span>
                      ) : (
                        tiposRes.codes.map(c => (
                          <span key={c} className="dte-chip" title={OPCION_LABEL[c] ?? c}>
                            {c} · {OPCION_LABEL[c] ?? c}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <div className="tenant-card__actions">
                  <button type="button" className="btn btn-sm" onClick={() => abrirEditar(t)}>
                    Configurar
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStatsTenant(t)}>
                    Estadísticas
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#7c3aed', color: '#fff', border: 'none' }}
                    onClick={() => { setPlanTenant(t); setPlanForm({ planTipo: 'BASICA', meses: 1 }); setPlanMsg(null); }}
                    title="Asignar plan de suscripción manualmente"
                  >
                    💳 Plan
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
                    onClick={() => entrarComoEmpresa(t.id)}
                    disabled={impersonandoId === t.id}
                    title="Entrar como administrador de esta empresa"
                  >
                    {impersonandoId === t.id ? '...' : '👁 Entrar como'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* ── Modal: Nueva empresa ─────────────────────────────────────────── */}
      {createModal && (
        <div className="modal-overlay" onClick={() => setCreateModal(false)}>
          <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Registrar nueva empresa</h3>
                <p className="modal-title-desc">
                  Datos fiscales, comprobantes permitidos y el primer usuario administrador del inquilino.
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateModal(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="admin-modal-section" style={{ gridColumn: 'span 2' }}>
                <p className="admin-modal-section__title">Datos de la empresa</p>
                <p className="admin-modal-section__hint">Información registrada ante MH.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Nombre legal / razón social</label>
                    <input
                      className="form-control"
                      value={createForm.nombreLegal}
                      onChange={e => setCreateForm({ ...createForm, nombreLegal: e.target.value })}
                      placeholder="Ej. Compañía S.A. de C.V."
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NIT</label>
                    <input
                      className="form-control"
                      inputMode="numeric"
                      value={createForm.nit}
                      onChange={e => setCreateForm({ ...createForm, nit: e.target.value })}
                      placeholder="14 dígitos"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NRC</label>
                    <input
                      className="form-control"
                      value={createForm.nrc}
                      onChange={e => setCreateForm({ ...createForm, nrc: e.target.value })}
                      placeholder="Número de registro"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico</label>
                    <input
                      className="form-control"
                      type="email"
                      value={createForm.correo}
                      onChange={e => setCreateForm({ ...createForm, correo: e.target.value })}
                      placeholder="contacto@empresa.com"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input
                      className="form-control"
                      value={createForm.telefono}
                      onChange={e => setCreateForm({ ...createForm, telefono: e.target.value })}
                      placeholder="0000-0000"
                    />
                  </div>
                </div>
              </div>

              <div className="admin-modal-section" style={{ gridColumn: 'span 2' }}>
                <p className="admin-modal-section__title">Comprobantes que podrá emitir</p>
                <p className="admin-modal-section__hint">
                  Debe quedar al menos un tipo seleccionado. “Solo 01” deja únicamente factura consumidor final.
                </p>
                <div className="dte-picker-toolbar">
                  <button type="button" className="btn btn-sm btn-outline" onClick={marcarTodosTiposCreate}>
                    Marcar todos
                  </button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={soloFacturaCfCreate}>
                    Solo factura CF (01)
                  </button>
                </div>
                <div className="dte-toggle-grid">
                  {OPCIONES_TIPO_DTE.map(({ codigo, label }) => (
                    <label key={codigo} className="dte-toggle">
                      <input
                        type="checkbox"
                        checked={createForm.tiposDteHabilitados.includes(codigo)}
                        onChange={() => toggleTipoCreate(codigo)}
                      />
                      <span>
                        <span className="dte-toggle__code">{codigo}</span>
                        {' '}
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="admin-modal-section" style={{ gridColumn: 'span 2' }}>
                <p className="admin-modal-section__title">Usuario administrador</p>
                <p className="admin-modal-section__hint">Recibirá acceso inicial a esta empresa.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Correo del administrador</label>
                    <input
                      className="form-control"
                      type="email"
                      value={createForm.adminEmail}
                      onChange={e => setCreateForm({ ...createForm, adminEmail: e.target.value })}
                      placeholder="admin@empresa.com"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre del administrador</label>
                    <input
                      className="form-control"
                      value={createForm.adminNombre}
                      onChange={e => setCreateForm({ ...createForm, adminNombre: e.target.value })}
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Contraseña temporal</label>
                    <input
                      className="form-control"
                      type="password"
                      value={createForm.adminPassword}
                      onChange={e => setCreateForm({ ...createForm, adminPassword: e.target.value })}
                      placeholder="Mínimo 8 caracteres recomendado"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer modal-footer--split">
              <button type="button" className="btn btn-outline" onClick={() => setCreateModal(false)}>Cancelar</button>
              <div className="modal-footer__primary">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => createMut.mutate(createForm)}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? 'Procesando…' : 'Dar de alta empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Configurar empresa ────────────────────────────────────── */}
      {editTenant && (
        <div className="modal-overlay" onClick={() => setEditTenant(null)}>
          <div className="modal modal--wide-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Configurar empresa</h3>
                <p className="modal-title-desc">{editTenant.nombreLegal}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditTenant(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Nombre Legal</label>
                <input className="form-control" value={editForm.nombreLegal} onChange={e => setEditForm({...editForm, nombreLegal: e.target.value})} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Nombre Comercial</label>
                <input className="form-control" value={editForm.nombreComercial} onChange={e => setEditForm({...editForm, nombreComercial: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">NIT</label>
                <input className="form-control" value={editForm.nit} onChange={e => setEditForm({...editForm, nit: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">NRC</label>
                <input className="form-control" value={editForm.nrc} onChange={e => setEditForm({...editForm, nrc: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Correo</label>
                <input className="form-control" type="email" value={editForm.correo} onChange={e => setEditForm({...editForm, correo: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-control" value={editForm.telefono} onChange={e => setEditForm({...editForm, telefono: e.target.value})} />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Giro / Actividad Económica</label>
                <input
                  className="form-control"
                  list="edit-lista-actividades"
                  value={editForm.descActividad}
                  onChange={e => {
                    const val = e.target.value;
                    const found = ACTIVIDADES_ECONOMICAS.find(a => a.descripcion === val);
                    setEditForm({ ...editForm, descActividad: val, codActividad: found ? found.codigo : editForm.codActividad });
                  }}
                  placeholder="Escribe para buscar actividad..."
                />
                <datalist id="edit-lista-actividades">
                  {ACTIVIDADES_ECONOMICAS.map(a => (
                    <option key={a.codigo} value={a.descripcion}>{a.codigo}</option>
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">Código Actividad</label>
                <input
                  className="form-control"
                  value={editForm.codActividad}
                  readOnly
                  style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-2)' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Departamento</label>
                <select
                  className="form-control"
                  value={editForm.departamento}
                  onChange={e => setEditForm({ ...editForm, departamento: e.target.value, municipio: '' })}
                >
                  <option value="">Seleccione Departamento</option>
                  {DEPARTAMENTOS.map(d => (
                    <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Municipio</label>
                <select
                  className="form-control"
                  value={editForm.municipio}
                  onChange={e => setEditForm({ ...editForm, municipio: e.target.value })}
                >
                  <option value="">Seleccione Municipio</option>
                  {getMunicipios(editForm.departamento).map(m => (
                    <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Dirección / Complemento</label>
                <input className="form-control" value={editForm.complemento} onChange={e => setEditForm({...editForm, complemento: e.target.value})} />
              </div>
              <div className="admin-modal-section" style={{ gridColumn: 'span 2' }}>
                <p className="admin-modal-section__title">Tipos de DTE habilitados</p>
                <p className="admin-modal-section__hint">Mínimo un tipo seleccionado.</p>
                <div className="dte-picker-toolbar">
                  <button type="button" className="btn btn-sm btn-outline" onClick={marcarTodosTiposEdit}>
                    Marcar todos
                  </button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={soloFacturaCfEdit}>
                    Solo factura CF (01)
                  </button>
                </div>
                <div className="dte-toggle-grid">
                  {OPCIONES_TIPO_DTE.map(({ codigo, label }) => (
                    <label key={codigo} className="dte-toggle">
                      <input
                        type="checkbox"
                        checked={(editForm.tiposDteHabilitados as string[] | undefined)?.includes(codigo)}
                        onChange={() => toggleTipoEdit(codigo)}
                      />
                      <span>
                        <span className="dte-toggle__code">{codigo}</span>
                        {' '}
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Ambiente MH</label>
                <select className="form-control" value={editForm.mhAmbiente} onChange={e => setEditForm({...editForm, mhAmbiente: e.target.value})}>
                  <option value="00">00 — Pruebas</option>
                  <option value="01">01 — Producción</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <hr style={{ border: '0', borderTop: '1px dashed #cbd5e1', margin: '4px 0 12px' }} />
                <label className="form-label" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
                  Credenciales Hacienda (Firmador)
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Password Certificado (clave privada)</label>
                <input className="form-control" type="password" value={editForm.mhPasswordCert ?? ''} onChange={e => setEditForm({...editForm, mhPasswordCert: e.target.value})} placeholder="Contraseña del .crt" />
              </div>
              <div className="form-group">
                <label className="form-label">API Key MH (opcional)</label>
                <input className="form-control" value={editForm.mhApiKey ?? ''} onChange={e => setEditForm({...editForm, mhApiKey: e.target.value})} placeholder="Token MH si aplica" />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.activo} onChange={e => setEditForm({...editForm, activo: e.target.checked})} />
                  Empresa activa
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.pagoAlDia} onChange={e => setEditForm({...editForm, pagoAlDia: e.target.checked})} />
                  Pago al día
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editForm.esAgenteRetencion} onChange={e => setEditForm({...editForm, esAgenteRetencion: e.target.checked})} />
                  Agente de retención
                </label>
              </div>
            </div>
            {/* ── Sección Usuarios ── */}
            <div style={{ padding: '0 24px 20px' }}>
              <div className="admin-modal-section" style={{ marginTop: 8 }}>
                <p className="admin-modal-section__title">Usuarios de la empresa</p>
                {usuariosEmpresa.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>Sin usuarios registrados.</p>
                ) : (
                  <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 16 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-2)', fontWeight: 500 }}>Nombre</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-2)', fontWeight: 500 }}>Email</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-2)', fontWeight: 500 }}>Rol</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-2)', fontWeight: 500 }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuariosEmpresa.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '6px 8px' }}>{u.nombre}</td>
                          <td style={{ padding: '6px 8px' }}>{u.email}</td>
                          <td style={{ padding: '6px 8px' }}><span className="badge badge--info">{u.rol}</span></td>
                          <td style={{ padding: '6px 8px' }}><span className={`badge ${u.activo ? 'badge--success' : 'badge--danger'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-2)', marginBottom: 10 }}>Agregar usuario</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-control" type="email" value={nuevoUsuario.email} onChange={e => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })} placeholder="correo@empresa.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input className="form-control" value={nuevoUsuario.nombre} onChange={e => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} placeholder="Nombre completo" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña</label>
                    <input className="form-control" type="password" value={nuevoUsuario.password} onChange={e => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select className="form-control" value={nuevoUsuario.rol} onChange={e => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}>
                      <option value="ADMIN">ADMIN — Acceso completo</option>
                      <option value="CONTADOR">CONTADOR — Reportes y consultas</option>
                      <option value="EMISOR">EMISOR — Solo emitir documentos</option>
                    </select>
                  </div>
                </div>
                {nuevoUsuarioMsg && (
                  <p style={{ fontSize: 13, color: nuevoUsuarioMsg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 6 }}>
                    {nuevoUsuarioMsg.texto}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={crearUsuarioEmpresa}
                  disabled={creandoUsuario}
                >
                  {creandoUsuario ? 'Creando...' : '+ Crear usuario'}
                </button>
              </div>
            </div>

            <div className="modal-footer modal-footer--split">
              <button type="button" className="btn btn-outline" onClick={() => setEditTenant(null)}>Cancelar</button>
              <div className="modal-footer__primary" style={{ alignItems: 'center' }}>
                {updateMut.isError && (
                  <span style={{ color: 'var(--danger)', fontSize: 13, marginRight: 8 }}>
                    {(updateMut.error as Error)?.message ?? 'Error al guardar'}
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => updateMut.mutate(editForm)}
                  disabled={updateMut.isPending}
                >
                  {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Asignar plan ──────────────────────────────────────────── */}
      {planTenant && (
        <div className="modal-overlay" onClick={() => setPlanTenant(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Asignar plan de suscripción</h3>
                <p className="modal-title-desc">{planTenant.nombreLegal}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlanTenant(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {planMsg ? (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', color: '#15803d', fontSize: 14 }}>
                  ✅ {planMsg}
                </div>
              ) : null}
              <div className="form-group">
                <label className="form-label">Plan</label>
                <select
                  className="form-control"
                  value={planForm.planTipo}
                  onChange={e => setPlanForm(f => ({ ...f, planTipo: e.target.value }))}
                >
                  {planesConfig.length > 0
                    ? planesConfig.map((p: any) => (
                        <option key={p.tipo} value={p.tipo}>
                          {p.nombre} — ${Number(p.precioMensual).toFixed(2)}/mes · {p.limiteDtesMensuales} DTEs · {p.limiteUsuarios} usuarios
                          {p.esPlanInicial ? ' ⭐' : ''}
                        </option>
                      ))
                    : (
                        <>
                          <option value="BASICA">Básica</option>
                          <option value="PROFESIONAL">Profesional</option>
                          <option value="EMPRESA">Empresa</option>
                        </>
                      )
                  }
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Meses de vigencia</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  max={24}
                  value={planForm.meses}
                  onChange={e => setPlanForm(f => ({ ...f, meses: Math.max(1, Number(e.target.value)) }))}
                />
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  La suscripción vencerá en {planForm.meses} mes(es) desde hoy.
                </p>
              </div>
              {asignarPlanMut.isError && (
                <div style={{ color: '#dc2626', fontSize: 13 }}>
                  Error: {(asignarPlanMut.error as any)?.response?.data?.message ?? 'No se pudo asignar el plan'}
                </div>
              )}
            </div>
            <div className="modal-footer modal-footer--split">
              <button type="button" className="btn btn-outline" onClick={() => setPlanTenant(null)}>Cancelar</button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                disabled={asignarPlanMut.isPending}
                onClick={() => asignarPlanMut.mutate({ empresaId: planTenant.id, planTipo: planForm.planTipo, meses: planForm.meses })}
              >
                {asignarPlanMut.isPending ? 'Asignando…' : 'Asignar plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Estadísticas ──────────────────────────────────────────── */}
      {statsTenant && (
        <div className="modal-overlay" onClick={() => setStatsTenant(null)}>
          <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Estadísticas</h3>
                <p className="modal-title-desc">{statsTenant.nombreLegal}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatsTenant(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              {statsLoading ? (
                <div className="loading-wrap"><div className="spinner" /></div>
              ) : stats ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                    <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total DTEs</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.totalDtes}</div>
                    </div>
                    <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total Facturado</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(stats.totalFacturado)}</div>
                    </div>
                    <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>DTEs este mes</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.empresa.dtesEmitidosMes}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>DESGLOSE POR TIPO</div>
                    <table className="table" style={{ fontSize: 13 }}>
                      <thead>
                        <tr><th>Tipo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Total</th></tr>
                      </thead>
                      <tbody>
                        {stats.desglose.length === 0 ? (
                          <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Sin documentos</td></tr>
                        ) : stats.desglose.map((r: any, i: number) => (
                          <tr key={i}>
                            <td>{TIPO_LABEL[r.tipoDte] ?? r.tipoDte}</td>
                            <td><span className="badge" style={{ fontSize: 11 }}>{r.estado}</span></td>
                            <td style={{ textAlign: 'right' }}>{r.cantidad}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(r.totalPagar)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>Ambiente: <strong>{AMBIENTES[stats.empresa.mhAmbiente] ?? stats.empresa.mhAmbiente}</strong></span>
                    <span>Estado: <strong style={{ color: stats.empresa.activo ? '#16a34a' : '#dc2626' }}>{stats.empresa.activo ? 'Activa' : 'Inactiva'}</strong></span>
                    <span>Pago: <strong style={{ color: stats.empresa.pagoAlDia ? '#16a34a' : '#dc2626' }}>{stats.empresa.pagoAlDia ? 'Al día' : 'Atrasado'}</strong></span>
                    <span>Alta: <strong>{new Date(stats.empresa.createdAt).toLocaleDateString('es-SV')}</strong></span>
                  </div>
                </>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setStatsTenant(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
