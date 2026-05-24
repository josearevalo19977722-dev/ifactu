import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

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
  free: 'Gratuito', monthly: 'Mensual', annual: 'Anual',
  lifetime_1: 'Vitalicio 1eq', lifetime_2: 'Vitalicio 2eq', lifetime_5: 'Vitalicio 5eq',
  ifactu: 'iFactu',
};

type Tab = 'licencias' | 'planes';

export function ExtensionLicenciasAdmin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('licencias');
  const [busqueda, setBusqueda] = useState('');
  const [modalCrear, setModalCrear] = useState(false);
  const [modalPlan, setModalPlan] = useState<Plan | null | 'nuevo'>(null);
  const [form, setForm] = useState({ nombre: '', email: '', plan: 'monthly', maxDtesMes: '', expiresAt: '', usuarioId: '' });
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
    input: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' } as React.CSSProperties,
    label: { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 } as React.CSSProperties,
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    modal: { background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' } as React.CSSProperties,
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
                      <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                        {lic.apiKey.slice(0, 8)}…
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
                      <div style={{ display: 'flex', gap: 6 }}>
                        {lic.activa ? (
                          <button
                            onClick={() => { if (confirm(`¿Revocar licencia de ${lic.email}?`)) revocarMut.mutate(lic.id); }}
                            style={s.btn('#ef4444')}
                          >
                            Revocar
                          </button>
                        ) : (
                          <button onClick={() => reactivarMut.mutate(lic.id)} style={s.btn('#10b981')}>
                            Reactivar
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
                    onClick={() => { if (confirm(`¿Eliminar plan "${p.nombre}"?`)) eliminarPlanMut.mutate(p.tipo); }}
                    style={s.btn('#ef4444')}
                  >
                    Eliminar
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
        <div style={s.overlay} onClick={() => setModalCrear(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>Nueva licencia</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={s.label}>Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={s.input} placeholder="Nombre del usuario" />
              </div>
              <div>
                <label style={s.label}>Email</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={s.input} placeholder="correo@ejemplo.com" type="email" />
              </div>
              <div>
                <label style={s.label}>Plan</label>
                <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} style={s.input}>
                  {Object.entries(PLAN_NOMBRES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Límite DTEs/mes (0 = ilimitado)</label>
                <input value={form.maxDtesMes} onChange={e => setForm({ ...form, maxDtesMes: e.target.value })} style={s.input} placeholder="200" type="number" />
              </div>
              <div>
                <label style={s.label}>Vence el (opcional)</label>
                <input value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} style={s.input} type="date" />
              </div>
              <div>
                <label style={s.label}>UUID de usuario iFactu (opcional — para vincular a un CONTADOR existente)</label>
                <input value={form.usuarioId} onChange={e => setForm({ ...form, usuarioId: e.target.value })} style={s.input} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  Si se especifica, el CONTADOR verá esta licencia en su página "Mi Licencia".
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalCrear(false)} style={{ ...s.btn('#94a3b8') }}>Cancelar</button>
              <button
                disabled={crearMut.isPending}
                onClick={() => crearMut.mutate({
                  nombre:    form.nombre,
                  email:     form.email,
                  origen:    form.usuarioId ? 'ifactu' : 'n1co',
                  plan:      form.usuarioId ? 'ifactu' : form.plan,
                  maxDtesMes: form.maxDtesMes ? Number(form.maxDtesMes) : undefined,
                  expiresAt: form.expiresAt || undefined,
                  usuarioId: form.usuarioId || undefined,
                })}
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
            <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>
              {modalPlan === 'nuevo' ? 'Nuevo plan' : `Editar: ${(modalPlan as Plan).nombre}`}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={s.label}>Tipo (slug, no modificable después)</label>
                <input
                  value={formPlan.tipo}
                  onChange={e => setFormPlan({ ...formPlan, tipo: e.target.value })}
                  style={s.input}
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
