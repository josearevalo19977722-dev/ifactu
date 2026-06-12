import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
}

interface Licencia {
  id: string;
  apiKey: string;
  origen: string;
  activa: boolean;
  plan: string;
  maxDtesMes: number;
  dtesUsadosMes: number;
  expiresAt: string | null;
  nombre: string | null;
  email: string | null;
  n1coOrderCode: string | null;
  createdAt: string;
}

interface Plan {
  tipo: string;
  nombre: string;
  precio: number;
  maxDtesMes: number;
  maxDispositivos: number;
  paymentLinkUrl: string | null;
  activo: boolean;
}

const PLAN_NOMBRES: Record<string, string> = {
  basico: 'Básico', pro: 'Pro', ilimitado: 'Ilimitado',
  ifactu: 'iFactu', updates: 'Updates de por vida',
  // Legacy
  free: 'Gratuito', monthly: 'Mensual', annual: 'Anual',
  lifetime_1: 'Vitalicio 1eq', lifetime_2: 'Vitalicio 2eq', lifetime_5: 'Vitalicio 5eq',
};

/** Planes que NO se asignan como plan de licencia (add-ons / internos) */
const PLANES_NO_ASIGNABLES = ['updates', 'ifactu', 'free'];

type Tab = 'licencias' | 'planes';

export function ExtensionLicenciasAdmin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('licencias');
  const [busqueda, setBusqueda] = useState('');
  const [modalCrear, setModalCrear] = useState(false);
  const [modalPlan, setModalPlan] = useState<Plan | null | 'nuevo'>(null);
  const [modoCrear, setModoCrear] = useState<'ifactu' | 'externo'>('ifactu');
  const [buscarUsuario, setBuscarUsuario] = useState('');
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ nombre: '', email: '', plan: 'basico' });
  const [formPlan, setFormPlan] = useState({ tipo: '', nombre: '', precio: '', maxDtesMes: '500', maxDispositivos: '1', paymentLinkUrl: '', activo: true });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: licencias = [], isLoading } = useQuery<Licencia[]>({
    queryKey: ['extension-licencias-admin'],
    queryFn: () => apiClient.get('/extension/licencias').then(r => r.data),
    enabled: tab === 'licencias',
  });

  const { data: planes = [] } = useQuery<Plan[]>({
    queryKey: ['extension-planes-admin'],
    queryFn: () => apiClient.get('/extension/admin/planes').then(r => r.data),
    enabled: tab === 'planes',
  });

  const { data: todosUsuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['superadmin-usuarios-mini'],
    queryFn: () => apiClient.get('/auth/superadmin/usuarios').then(r => r.data),
    enabled: modalCrear && modoCrear === 'ifactu',
  });

  const usuariosFiltrados = useMemo(() => {
    const q = buscarUsuario.toLowerCase().trim();
    if (!q) return todosUsuarios.slice(0, 8);
    return todosUsuarios
      .filter(u => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [todosUsuarios, buscarUsuario]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const crearMut = useMutation({
    mutationFn: (body: any) => apiClient.post('/extension/licencias', body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['extension-licencias-admin'] }); setModalCrear(false); },
  });

  const revocarMut = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/extension/licencias/${id}/revocar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension-licencias-admin'] }),
  });

  const reactivarMut = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/extension/licencias/${id}/reactivar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension-licencias-admin'] }),
  });

  const regenerarMut = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/extension/licencias/${id}/regenerar-clave`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension-licencias-admin'] }),
  });

  const upsertPlanMut = useMutation({
    mutationFn: (body: any) => apiClient.put(`/extension/admin/planes/${body.tipo}`, body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['extension-planes-admin'] }); setModalPlan(null); },
  });

  const eliminarPlanMut = useMutation({
    mutationFn: (tipo: string) => apiClient.delete(`/extension/admin/planes/${tipo}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extension-planes-admin'] }),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const licenciasFiltradas = licencias.filter(l =>
    !busqueda ||
    l.email?.toLowerCase().includes(busqueda.toLowerCase()) ||
    l.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    l.apiKey.toLowerCase().includes(busqueda.toLowerCase()),
  );

  const abrirModalPlan = (p: Plan) => {
    setFormPlan({
      tipo: p.tipo,
      nombre: p.nombre,
      precio: String(p.precio),
      maxDtesMes: String(p.maxDtesMes),
      maxDispositivos: String(p.maxDispositivos),
      paymentLinkUrl: p.paymentLinkUrl ?? '',
      activo: p.activo,
    });
    setModalPlan(p);
  };

  const abrirNuevoPlan = () => {
    setFormPlan({ tipo: '', nombre: '', precio: '', maxDtesMes: '500', maxDispositivos: '1', paymentLinkUrl: '', activo: true });
    setModalPlan('nuevo');
  };

  // ── Estilos inline ─────────────────────────────────────────────────────────
  const s = {
    card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
    btn: (color: string) => ({
      padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
      fontSize: 12, fontWeight: 600, background: color, color: '#fff',
    } as React.CSSProperties),
    input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', WebkitTextFillColor: '#0f172a' } as React.CSSProperties,
    inputDisabled: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', color: '#94a3b8', background: '#f1f5f9', WebkitTextFillColor: '#94a3b8', cursor: 'not-allowed' } as React.CSSProperties,
    label: { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 } as React.CSSProperties,
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    modal: { background: '#ffffff', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', color: '#0f172a' } as React.CSSProperties,
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
        🧩 Extensión iFactu_Conta — Licencias
      </h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        Gestiona licencias de la extensión Chrome y planes disponibles.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        {(['licencias', 'planes'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              color: tab === t ? '#6366f1' : '#64748b',
              borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t === 'licencias' ? `Licencias (${licencias.length})` : 'Planes'}
          </button>
        ))}
      </div>

      {/* ─── TAB: Licencias ─── */}
      {tab === 'licencias' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por email, nombre o clave…"
              style={{ ...s.input, maxWidth: 360 }}
            />
            <button onClick={() => setModalCrear(true)} style={s.btn('#6366f1')}>
              + Nueva licencia
            </button>
          </div>

          {isLoading && <div style={{ color: '#64748b', fontSize: 14 }}>Cargando…</div>}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  {['Email / Nombre', 'Clave', 'Plan', 'DTEs mes', 'Vence', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {licenciasFiltradas.map((lic, i) => (
                  <tr key={lic.id} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{lic.nombre || '—'}</div>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{lic.email || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <code
                        title="Click para copiar"
                        onClick={() => navigator.clipboard.writeText(lic.apiKey)}
                        style={{ fontSize: 11, background: '#e2e8f0', color: '#1e293b', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', letterSpacing: 1.5, fontWeight: 600, display: 'inline-block' }}
                      >
                        {lic.apiKey.replace(/-/g, '').toUpperCase().match(/.{1,4}/g)?.join('-') ?? lic.apiKey}
                      </code>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                        {PLAN_NOMBRES[lic.plan] ?? lic.plan}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {lic.maxDtesMes === 0 ? (
                        <span style={{ color: '#10b981', fontSize: 11, fontWeight: 600 }}>Ilimitado</span>
                      ) : (
                        <span style={{ color: lic.dtesUsadosMes / lic.maxDtesMes > 0.9 ? '#ef4444' : '#334155' }}>
                          {lic.dtesUsadosMes} / {lic.maxDtesMes}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>
                      {lic.expiresAt
                        ? new Date(lic.expiresAt).toLocaleDateString('es-SV')
                        : <span style={{ color: '#10b981' }}>Sin vence</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: lic.activa ? '#dcfce7' : '#fee2e2',
                        color: lic.activa ? '#166534' : '#991b1b',
                      }}>
                        {lic.activa ? 'Activa' : 'Revocada'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          title="Genera una nueva clave manteniendo el mismo registro"
                          disabled={regenerarMut.isPending && regenerarMut.variables === lic.id}
                          onClick={() => { if (confirm(`¿Regenerar clave de ${lic.email || lic.nombre}? La clave anterior dejará de funcionar.`)) regenerarMut.mutate(lic.id); }}
                          style={s.btn('#f59e0b')}
                        >
                          {regenerarMut.isPending && regenerarMut.variables === lic.id ? '⏳' : '🔄 Clave'}
                        </button>
                        {lic.activa ? (
                          <button
                            disabled={revocarMut.isPending && revocarMut.variables === lic.id}
                            onClick={() => { if (confirm(`¿Revocar licencia de ${lic.email}?`)) revocarMut.mutate(lic.id); }}
                            style={s.btn('#ef4444')}
                          >
                            {revocarMut.isPending && revocarMut.variables === lic.id ? '⏳' : 'Revocar'}
                          </button>
                        ) : (
                          <button
                            disabled={reactivarMut.isPending && reactivarMut.variables === lic.id}
                            onClick={() => reactivarMut.mutate(lic.id)}
                            style={s.btn('#10b981')}
                          >
                            {reactivarMut.isPending && reactivarMut.variables === lic.id ? '⏳' : 'Reactivar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {licenciasFiltradas.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>
                      No se encontraron licencias.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── TAB: Planes ─── */}
      {tab === 'planes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={abrirNuevoPlan} style={s.btn('#6366f1')}>+ Nuevo plan</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {planes.map(p => (
              <div key={p.tipo} style={{ ...s.card, opacity: p.activo ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{p.nombre}</div>
                    <code style={{ fontSize: 11, color: '#94a3b8' }}>{p.tipo}</code>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#6366f1' }}>${Number(p.precio).toFixed(2)}</div>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>📄 {p.maxDtesMes === 0 ? 'DTEs ilimitados' : `${p.maxDtesMes} DTEs/mes`}</div>
                  <div>🖥️ {p.maxDispositivos} dispositivo(s)</div>
                  <div>
                    🔗 {p.paymentLinkUrl
                      ? <a href={p.paymentLinkUrl} target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>Link configurado</a>
                      : <span style={{ color: '#ef4444' }}>Sin link de pago</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => abrirModalPlan(p)} style={s.btn('#475569')}>Editar</button>
                  <button
                    disabled={eliminarPlanMut.isPending && eliminarPlanMut.variables === p.tipo}
                    onClick={() => { if (confirm(`¿Eliminar plan "${p.nombre}"?`)) eliminarPlanMut.mutate(p.tipo); }}
                    style={s.btn('#ef4444')}
                  >
                    {eliminarPlanMut.isPending && eliminarPlanMut.variables === p.tipo ? '⏳' : 'Eliminar'}
                  </button>
                </div>
              </div>
            ))}
            {planes.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 13, gridColumn: '1/-1', textAlign: 'center', padding: 32 }}>
                No hay planes configurados.
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Modal: Crear licencia ─── */}
      {modalCrear && (
        <div style={s.overlay} onClick={() => { setModalCrear(false); setUsuarioSeleccionado(null); setBuscarUsuario(''); }}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Nueva licencia</h2>

            {/* Toggle modo */}
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 20, gap: 4 }}>
              {(['ifactu', 'externo'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setModoCrear(m); setUsuarioSeleccionado(null); setBuscarUsuario(''); }}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, transition: 'all .15s',
                    background: modoCrear === m ? '#fff' : 'transparent',
                    color: modoCrear === m ? '#6366f1' : '#64748b',
                    boxShadow: modoCrear === m ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
                  }}
                >
                  {m === 'ifactu' ? '👤 Usuario iFactu' : '🌐 Cliente externo'}
                </button>
              ))}
            </div>

            {/* ── Modo: usuario iFactu ── */}
            {modoCrear === 'ifactu' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {!usuarioSeleccionado ? (
                  <>
                    <div>
                      <label style={s.label}>Buscar usuario</label>
                      <input
                        autoFocus
                        value={buscarUsuario}
                        onChange={e => setBuscarUsuario(e.target.value)}
                        style={s.input}
                        placeholder="Nombre o correo del CONTADOR…"
                      />
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                      {usuariosFiltrados.length === 0 && (
                        <div style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 13 }}>Sin resultados</div>
                      )}
                      {usuariosFiltrados.map(u => (
                        <div
                          key={u.id}
                          onClick={() => setUsuarioSeleccionado(u)}
                          style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{u.nombre}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{u.email}</div>
                          </div>
                          <span style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9', padding: '2px 7px', borderRadius: 99, fontWeight: 600 }}>
                            {u.rol}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#166534' }}>✅ {usuarioSeleccionado.nombre}</div>
                      <div style={{ fontSize: 12, color: '#15803d' }}>{usuarioSeleccionado.email}</div>
                    </div>
                    <button onClick={() => setUsuarioSeleccionado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 18 }}>✕</button>
                  </div>
                )}
                <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                  💡 Se creará una licencia <strong>iFactu incluido</strong> (DTEs ilimitados, sin vencimiento). El usuario la verá automáticamente en su panel.
                </div>
              </div>
            )}

            {/* ── Modo: cliente externo ── */}
            {modoCrear === 'externo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={s.label}>Nombre</label>
                  <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={s.input} placeholder="Nombre del cliente" autoFocus />
                </div>
                <div>
                  <label style={s.label}>Email</label>
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={s.input} placeholder="correo@ejemplo.com" type="email" />
                </div>
                <div>
                  <label style={s.label}>Plan</label>
                  <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} style={s.input}>
                    {planes.filter(p => p.activo && !PLANES_NO_ASIGNABLES.includes(p.tipo)).map(p => (
                      <option key={p.tipo} value={p.tipo}>{p.nombre} — ${Number(p.precio).toFixed(2)}</option>
                    ))}
                    {planes.length === 0 && (['basico', 'pro', 'ilimitado'] as const).map(k => (
                      <option key={k} value={k}>{PLAN_NOMBRES[k]}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setModalCrear(false); setUsuarioSeleccionado(null); setBuscarUsuario(''); }}
                style={s.btn('#94a3b8')}
              >
                Cancelar
              </button>
              <button
                disabled={crearMut.isPending || (modoCrear === 'ifactu' && !usuarioSeleccionado) || (modoCrear === 'externo' && (!form.nombre || !form.email))}
                onClick={() => {
                  if (modoCrear === 'ifactu' && usuarioSeleccionado) {
                    crearMut.mutate({
                      nombre:    usuarioSeleccionado.nombre,
                      email:     usuarioSeleccionado.email,
                      origen:    'ifactu',
                      plan:      'ifactu',
                      maxDtesMes: 0,
                      usuarioId: usuarioSeleccionado.id,
                    });
                  } else {
                    crearMut.mutate({
                      nombre:  form.nombre,
                      email:   form.email,
                      origen:  'n1co',
                      plan:    form.plan,
                    });
                  }
                }}
                style={s.btn('#6366f1')}
              >
                {crearMut.isPending ? 'Creando…' : 'Crear licencia'}
              </button>
            </div>
            {crearMut.isError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>Error al crear la licencia.</div>}
          </div>
        </div>
      )}

      {/* ─── Modal: Plan ─── */}
      {modalPlan !== null && (
        <div style={s.overlay} onClick={() => setModalPlan(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
              {modalPlan === 'nuevo' ? 'Nuevo plan' : `Editar: ${(modalPlan as Plan).nombre}`}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={s.label}>Tipo (slug, no modificable después)</label>
                <input
                  value={formPlan.tipo}
                  onChange={e => setFormPlan({ ...formPlan, tipo: e.target.value })}
                  style={modalPlan !== 'nuevo' ? s.inputDisabled : s.input}
                  placeholder="monthly"
                  disabled={modalPlan !== 'nuevo'}
                />
              </div>
              <div>
                <label style={s.label}>Nombre visible</label>
                <input value={formPlan.nombre} onChange={e => setFormPlan({ ...formPlan, nombre: e.target.value })} style={s.input} placeholder="Plan Mensual" />
              </div>
              <div>
                <label style={s.label}>Precio (USD)</label>
                <input value={formPlan.precio} onChange={e => setFormPlan({ ...formPlan, precio: e.target.value })} style={s.input} type="number" step="0.01" placeholder="9.99" />
              </div>
              <div>
                <label style={s.label}>Máx DTEs/mes (0 = ilimitado)</label>
                <input value={formPlan.maxDtesMes} onChange={e => setFormPlan({ ...formPlan, maxDtesMes: e.target.value })} style={s.input} type="number" />
              </div>
              <div>
                <label style={s.label}>Máx dispositivos</label>
                <input value={formPlan.maxDispositivos} onChange={e => setFormPlan({ ...formPlan, maxDispositivos: e.target.value })} style={s.input} type="number" />
              </div>
              <div>
                <label style={s.label}>URL de pago N1CO (payment link)</label>
                <input value={formPlan.paymentLinkUrl} onChange={e => setFormPlan({ ...formPlan, paymentLinkUrl: e.target.value })} style={s.input} placeholder="https://n1co.shop/pay/…" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={formPlan.activo} onChange={e => setFormPlan({ ...formPlan, activo: e.target.checked })} id="plan-activo" />
                <label htmlFor="plan-activo" style={{ fontSize: 13, color: '#334155' }}>Plan activo (visible en la tienda)</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalPlan(null)} style={s.btn('#94a3b8')}>Cancelar</button>
              <button
                disabled={upsertPlanMut.isPending}
                onClick={() => upsertPlanMut.mutate({
                  tipo:            formPlan.tipo,
                  nombre:          formPlan.nombre,
                  precio:          Number(formPlan.precio),
                  maxDtesMes:      Number(formPlan.maxDtesMes),
                  maxDispositivos: Number(formPlan.maxDispositivos),
                  paymentLinkUrl:  formPlan.paymentLinkUrl || null,
                  activo:          formPlan.activo,
                })}
                style={s.btn('#6366f1')}
              >
                {upsertPlanMut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            {upsertPlanMut.isError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>Error al guardar.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
