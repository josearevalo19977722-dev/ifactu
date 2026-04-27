import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

const ESTADO_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  PAGADO:    { bg: '#022c22', color: '#34d399', border: '#065f46' },
  PENDIENTE: { bg: '#422006', color: '#fbbf24', border: '#92400e' },
  FALLIDO:   { bg: '#450a0a', color: '#f87171', border: '#991b1b' },
  CANCELADO: { bg: '#1e293b', color: '#64748b', border: '#334155' },
};

const PLAN_COLOR: Record<string, string> = {
  BASICA:      '#6366f1',
  PROFESIONAL: '#3b82f6',
  EMPRESA:     '#8b5cf6',
};
function planColor(tipo: string) {
  return PLAN_COLOR[tipo] ?? '#10b981';
}

const TIPO_ICONS: Record<string, string> = {
  BASICA: '🌱', PROFESIONAL: '🚀', EMPRESA: '🏢',
};
function planIcon(tipo: string) {
  return TIPO_ICONS[tipo] ?? '📦';
}

type Tab = 'pagos' | 'config' | 'ordenes' | 'catalogo' | 'paquetes';


const EMPTY_FORM = {
  tipo: '', nombre: '', descripcion: '', precioMensual: 0,
  limiteDtesMensuales: 100, limiteUsuarios: 3,
  n1coPlanId: '', paymentLinkUrl: '', activo: true, esPlanInicial: false,
};

const TAB_LABELS: Record<Tab, string> = {
  pagos:    '🧾 Historial pagos',
  config:   '⚙️ Config planes',
  ordenes:  '📦 Órdenes N1CO',
  catalogo: '🛒 Paquetes extra',
  paquetes: '📋 Solicitudes',
};

export function PagosAdmin() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pagos');
  const [busqueda, setBusqueda] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Estado de edición de planes existentes
  const [editPlanes, setEditPlanes] = useState<Record<string, any>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});

  // Modal nuevo plan
  const [showNuevo, setShowNuevo] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ ...EMPTY_FORM });

  // Confirmación eliminar
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Edición de paquete extra
  const [editPaquete, setEditPaquete] = useState<any | null>(null);
  const [editPaqueteForm, setEditPaqueteForm] = useState({ cantidad: 50, precio: 5, esPermanente: false, notas: '' });

  // Catálogo de opciones disponibles para empresas
  const [showCatalogo, setShowCatalogo] = useState(false);
  const [nuevaOpcion, setNuevaOpcion] = useState({ nombre: '', cantidad: 50, precio: 5, orden: 0 });

  // Nuevo paquete desde superadmin
  const [showNuevoPaquete, setShowNuevoPaquete] = useState(false);
  const NUEVO_PKG_EMPTY = { empresaId: '', cantidad: 50, precio: 5, esPermanente: false, notas: '', activarInmediatamente: true };
  const [nuevoPaqueteForm, setNuevoPaqueteForm] = useState({ ...NUEVO_PKG_EMPTY });
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');

  const { data: pagos = [], isLoading: loadPagos } = useQuery({
    queryKey: ['admin-pagos'],
    queryFn: () => apiClient.get('/billing/admin/pagos').then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: planesConfig = [], isLoading: loadConfig } = useQuery({
    queryKey: ['admin-planes-config'],
    queryFn: () => apiClient.get('/billing/admin/planes-config').then(r => r.data),
    enabled: tab === 'config',
  });

  useEffect(() => {
    if ((planesConfig as any[]).length > 0) {
      const map: Record<string, any> = {};
      (planesConfig as any[]).forEach(p => {
        map[p.tipo] = { ...p, n1coPlanId: p.n1coPlanId ?? '', paymentLinkUrl: p.paymentLinkUrl ?? '' };
      });
      setEditPlanes(map);
    }
  }, [planesConfig]);

  const { data: ordenes = [], isLoading: loadOrdenes } = useQuery({
    queryKey: ['admin-n1co-ordenes'],
    queryFn: () => apiClient.get('/billing/admin/n1co/ordenes').then(r => r.data),
    enabled: tab === 'ordenes',
  });

  const { data: paquetesExtra = [], isLoading: loadPaquetes, refetch: refetchPaquetes } = useQuery({
    queryKey: ['admin-paquetes-extra'],
    queryFn: () => apiClient.get('/billing/admin/paquetes-extras').then(r => r.data),
    enabled: tab === 'paquetes',
    refetchInterval: tab === 'paquetes' ? 30_000 : false,
  });

  const { data: empresasList = [] } = useQuery({
    queryKey: ['superadmin-empresas-lista'],
    queryFn: () => apiClient.get('/superadmin/empresas').then(r => r.data),
    enabled: tab === 'paquetes' || tab === 'catalogo',
  });

  const { data: catalogoOpciones = [], refetch: refetchCatalogo } = useQuery({
    queryKey: ['admin-paquetes-catalogo'],
    queryFn: () => apiClient.get('/billing/admin/paquetes-catalogo').then(r => r.data),
    enabled: tab === 'catalogo' || tab === 'paquetes',
  });

  const crearOpcionMut = useMutation({
    mutationFn: (data: any) => apiClient.post('/billing/admin/paquetes-catalogo', data).then(r => r.data),
    onSuccess: () => { refetchCatalogo(); setNuevaOpcion({ nombre: '', cantidad: 50, precio: 5, orden: 0 }); },
  });

  const toggleOpcionMut = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      apiClient.patch(`/billing/admin/paquetes-catalogo/${id}`, { activo }).then(r => r.data),
    onSuccess: () => { refetchCatalogo(); qc.invalidateQueries({ queryKey: ['paquetes-extras-catalogo'] }); },
  });

  const eliminarOpcionMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/billing/admin/paquetes-catalogo/${id}`).then(r => r.data),
    onSuccess: () => { refetchCatalogo(); qc.invalidateQueries({ queryKey: ['paquetes-extras-catalogo'] }); },
  });

  const crearPlanesN1coMut = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/billing/admin/paquetes-catalogo/${id}/crear-planes-n1co`).then(r => r.data),
    onSuccess: () => { refetchCatalogo(); qc.invalidateQueries({ queryKey: ['paquetes-extras-catalogo'] }); },
  });

  const crearPlanN1coMut = useMutation({
    mutationFn: (tipo: string) =>
      apiClient.post(`/billing/admin/planes-config/${tipo}/crear-plan-n1co`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-planes-config'] }),
  });

  const activarPaqueteMut = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/billing/admin/paquetes-extras/${id}/activar`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-paquetes-extra'] }); },
  });

  const cancelarPaqueteMut = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/billing/admin/paquetes-extras/${id}/cancelar`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-paquetes-extra'] }); },
  });

  const editarPaqueteMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/billing/admin/paquetes-extras/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-paquetes-extra'] });
      setEditPaquete(null);
    },
  });

  const crearPaqueteAdminMut = useMutation({
    mutationFn: (data: any) =>
      apiClient.post('/billing/admin/paquetes-extras', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-paquetes-extra'] });
      setShowNuevoPaquete(false);
      setNuevoPaqueteForm({ ...NUEVO_PKG_EMPTY });
      setBusquedaEmpresa('');
    },
  });

  const guardarPlanMut = useMutation({
    mutationFn: ({ tipo, data }: { tipo: string; data: any }) =>
      apiClient.put(`/billing/admin/planes-config/${tipo}`, data).then(r => r.data),
    onSuccess: (_, { tipo }) => {
      qc.invalidateQueries({ queryKey: ['admin-planes-config'] });
      setSavedMsg(m => ({ ...m, [tipo]: '✅ Guardado' }));
      setTimeout(() => setSavedMsg(m => ({ ...m, [tipo]: '' })), 3000);
    },
  });

  const marcarInicialMut = useMutation({
    mutationFn: (tipo: string) =>
      apiClient.put(`/billing/admin/planes-config/${tipo}/inicial`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-planes-config'] }),
  });

  const crearPlanMut = useMutation({
    mutationFn: (data: any) =>
      apiClient.post('/billing/admin/planes-config', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-planes-config'] });
      setShowNuevo(false);
      setNuevoForm({ ...EMPTY_FORM });
    },
  });

  const eliminarPlanMut = useMutation({
    mutationFn: (tipo: string) =>
      apiClient.delete(`/billing/admin/planes-config/${tipo}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-planes-config'] });
      setConfirmDelete(null);
    },
  });

  // Stats
  const totalRecaudado = (pagos as any[])
    .filter(p => p.estado === 'PAGADO')
    .reduce((s, p) => s + Number(p.monto), 0);
  const pagosPendientes = (pagos as any[]).filter(p => p.estado === 'PENDIENTE').length;
  const pagosPagados    = (pagos as any[]).filter(p => p.estado === 'PAGADO').length;

  const pagosFiltrados = (pagos as any[]).filter(p => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      p.empresa?.nombreLegal?.toLowerCase().includes(q) ||
      p.empresa?.nombreComercial?.toLowerCase().includes(q) ||
      p.planTipo?.toLowerCase().includes(q) ||
      p.estado?.toLowerCase().includes(q) ||
      p.orderCode?.toLowerCase().includes(q)
    );
  });

  const setField = (tipo: string, field: string, value: any) =>
    setEditPlanes(e => ({ ...e, [tipo]: { ...e[tipo], [field]: value } }));

  const setNuevo = (field: string, value: any) =>
    setNuevoForm(f => ({ ...f, [field]: value }));

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1160, minHeight: '100vh', background: '#0f172a' }}>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                💳
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: -0.5 }}>
                Pagos &amp; N1CO
              </h1>
            </div>
            <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>
              Administración de suscripciones, paquetes y configuración de planes
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace', padding: '4px 10px', background: '#1e293b', borderRadius: 6, border: '1px solid #334155' }}>
              {(pagos as any[]).length} pagos totales
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard
          icon="💰"
          iconBg="linear-gradient(135deg, #064e3b, #065f46)"
          iconColor="#34d399"
          label="Total recaudado"
          value={`$${totalRecaudado.toFixed(2)}`}
          valueColor="#34d399"
          sub="pagos confirmados"
        />
        <StatCard
          icon="✅"
          iconBg="linear-gradient(135deg, #1e3a5f, #1d4ed8)"
          iconColor="#60a5fa"
          label="Pagos confirmados"
          value={String(pagosPagados)}
          valueColor="#60a5fa"
          sub="estado PAGADO"
        />
        <StatCard
          icon="⏳"
          iconBg="linear-gradient(135deg, #451a03, #92400e)"
          iconColor="#fbbf24"
          label="Pendientes de pago"
          value={String(pagosPendientes)}
          valueColor="#fbbf24"
          sub="en espera de cobro"
        />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid #1e293b', paddingBottom: 0 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              background: 'transparent',
              color: tab === t ? '#e2e8f0' : '#475569',
              fontWeight: tab === t ? 700 : 500,
              fontSize: 13,
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Tab Pagos ────────────────────────────────────────────────────────── */}
      {tab === 'pagos' && (
        <div>
          {/* Search bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 440 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: 14 }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar empresa, plan, estado, orderCode..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px 9px 36px',
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 8, color: '#e2e8f0', fontSize: 13,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            {busqueda && (
              <span style={{ fontSize: 12, color: '#475569' }}>
                {pagosFiltrados.length} resultado{pagosFiltrados.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadPagos ? (
            <LoadingState text="Cargando pagos..." />
          ) : pagosFiltrados.length === 0 ? (
            <EmptyState icon="🧾" text={busqueda ? 'Sin resultados para la búsqueda' : 'No hay pagos registrados aún'} />
          ) : (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#0f172a' }}>
                    {['Empresa', 'Plan', 'Monto', 'Estado', 'OrderCode', 'Fecha'].map(h => (
                      <th key={h} style={{ padding: '11px 16px', textAlign: 'left', color: '#475569', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagosFiltrados.map((p: any) => {
                    const ec = ESTADO_COLOR[p.estado] ?? ESTADO_COLOR.CANCELADO;
                    const isHovered = hoveredRow === p.id;
                    return (
                      <tr
                        key={p.id}
                        onMouseEnter={() => setHoveredRow(p.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{ borderTop: '1px solid #0f172a', background: isHovered ? '#253348' : 'transparent', transition: 'background 0.1s' }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>
                            {p.empresa?.nombreComercial || p.empresa?.nombreLegal || '—'}
                          </div>
                          {p.empresa?.nombreComercial && p.empresa?.nombreLegal && (
                            <div style={{ color: '#475569', fontSize: 11 }}>{p.empresa.nombreLegal}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: planColor(p.planTipo) + '20',
                            color: planColor(p.planTipo),
                            border: `1px solid ${planColor(p.planTipo)}40`,
                            padding: '3px 10px', borderRadius: 20, fontWeight: 700, fontSize: 11,
                          }}>
                            {planIcon(p.planTipo)} {p.planTipo}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ color: '#34d399', fontWeight: 800, fontSize: 15 }}>${Number(p.monto).toFixed(2)}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: ec.bg, color: ec.color,
                            border: `1px solid ${ec.border}`,
                            padding: '3px 10px', borderRadius: 20, fontWeight: 700, fontSize: 11,
                          }}>
                            {p.estado}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>
                          {p.orderCode ?? <span style={{ color: '#334155' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569', fontSize: 12 }}>
                          {new Date(p.createdAt).toLocaleDateString('es-SV')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab Config Planes ────────────────────────────────────────────────── */}
      {tab === 'config' && (
        loadConfig ? (
          <LoadingState text="Cargando configuración de planes..." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                Editá precio, límites y link de pago. El{' '}
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>Plan inicial</span>{' '}
                se asigna automáticamente a las nuevas empresas.
              </p>
              <button
                onClick={() => setShowNuevo(true)}
                style={{
                  padding: '9px 20px', background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
                }}
              >
                ➕ Nuevo plan
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 20 }}>
              {(planesConfig as any[]).map((plan: any) => {
                const form = editPlanes[plan.tipo] ?? plan;
                const isSaving = guardarPlanMut.isPending && (guardarPlanMut.variables as any)?.tipo === plan.tipo;
                const color = planColor(plan.tipo);

                return (
                  <div key={plan.tipo} style={{
                    background: '#1e293b',
                    border: `1px solid ${form.esPlanInicial ? '#f59e0b' : '#334155'}`,
                    borderRadius: 14, overflow: 'hidden', position: 'relative',
                    boxShadow: form.esPlanInicial ? '0 0 0 1px #f59e0b40, 0 4px 24px rgba(0,0,0,0.3)' : '0 2px 12px rgba(0,0,0,0.2)',
                  }}>
                    {/* Color bar top */}
                    <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}80)` }} />

                    {/* Badge plan inicial */}
                    {form.esPlanInicial && (
                      <div style={{
                        position: 'absolute', top: 3, right: 16,
                        background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                        color: '#000', fontSize: 10, fontWeight: 800,
                        padding: '3px 10px', borderRadius: '0 0 8px 8px', letterSpacing: 0.3,
                      }}>
                        ⭐ PLAN INICIAL
                      </div>
                    )}

                    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '20', border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                          {planIcon(plan.tipo)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color, fontSize: 16, letterSpacing: -0.3 }}>{plan.tipo}</div>
                          {plan.n1coPlanId && (
                            <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>N1CO ID: {plan.n1coPlanId}</div>
                          )}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.activo ?? true} onChange={e => setField(plan.tipo, 'activo', e.target.checked)} />
                          Activo
                        </label>
                        <button
                          onClick={() => setConfirmDelete(plan.tipo)}
                          title="Eliminar plan"
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, padding: '2px 4px', opacity: 0.7 }}
                        >🗑️</button>
                      </div>

                      {/* Nombre */}
                      <div>
                        <label style={labelStyle}>Nombre del plan</label>
                        <input value={form.nombre ?? ''} onChange={e => setField(plan.tipo, 'nombre', e.target.value)} style={inputStyle} />
                      </div>

                      {/* Descripción */}
                      <div>
                        <label style={labelStyle}>Descripción</label>
                        <input value={form.descripcion ?? ''} onChange={e => setField(plan.tipo, 'descripcion', e.target.value)} style={inputStyle} />
                      </div>

                      {/* Precio + Límites */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={labelStyle}>Precio/mes</label>
                          <div style={{ position: 'relative', marginTop: 4 }}>
                            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }}>$</span>
                            <input type="number" min={0} step={0.01} value={form.precioMensual ?? ''}
                              onChange={e => setField(plan.tipo, 'precioMensual', parseFloat(e.target.value))}
                              style={{ ...inputStyle, paddingLeft: 20, color: '#34d399', fontWeight: 800, marginTop: 0 }} />
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>DTEs/mes</label>
                          <input type="number" min={1} value={form.limiteDtesMensuales ?? ''}
                            onChange={e => setField(plan.tipo, 'limiteDtesMensuales', parseInt(e.target.value))}
                            style={{ ...inputStyle, marginTop: 4 }} />
                        </div>
                        <div>
                          <label style={labelStyle}>Usuarios</label>
                          <input type="number" min={1} value={form.limiteUsuarios ?? ''}
                            onChange={e => setField(plan.tipo, 'limiteUsuarios', parseInt(e.target.value))}
                            style={{ ...inputStyle, marginTop: 4 }} />
                        </div>
                      </div>

                      {/* N1CO Plan ID + Link */}
                      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
                        <div>
                          <label style={labelStyle}>Plan ID</label>
                          <input type="number" value={form.n1coPlanId ?? ''}
                            onChange={e => setField(plan.tipo, 'n1coPlanId', parseInt(e.target.value) || null)}
                            style={{ ...inputStyle, marginTop: 4 }} />
                        </div>
                        <div>
                          <label style={labelStyle}>Link de pago N1CO</label>
                          <input value={form.paymentLinkUrl ?? ''}
                            onChange={e => setField(plan.tipo, 'paymentLinkUrl', e.target.value)}
                            placeholder="https://pay.n1co.shop/pl/..."
                            style={{ ...inputStyle, marginTop: 4, fontSize: 11 }} />
                        </div>
                      </div>

                      {/* N1CO status + create btn */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
                        <button
                          type="button"
                          onClick={() => crearPlanN1coMut.mutate(plan.tipo)}
                          disabled={crearPlanN1coMut.isPending && (crearPlanN1coMut.variables as string) === plan.tipo}
                          style={{
                            padding: '6px 14px', borderRadius: 6,
                            border: '1px solid #6366f1',
                            background: 'transparent', color: '#818cf8',
                            fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          {crearPlanN1coMut.isPending && (crearPlanN1coMut.variables as string) === plan.tipo
                            ? '⏳ Creando...'
                            : form.n1coPlanId ? '🔄 Re-crear N1CO' : '🔗 Crear en N1CO'}
                        </button>
                        {form.n1coPlanId ? (
                          <span style={{ fontSize: 11, color: '#34d399' }}>✅ Plan #{form.n1coPlanId} configurado</span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#fbbf24' }}>⚠️ Sin plan N1CO — cobro en línea no disponible</span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4 }}>
                        <button
                          onClick={() => guardarPlanMut.mutate({ tipo: plan.tipo, data: form })}
                          disabled={isSaving}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            background: isSaving ? '#334155' : color,
                            color: '#fff', fontWeight: 700, fontSize: 14, opacity: isSaving ? 0.7 : 1,
                            transition: 'all 0.15s',
                          }}
                        >
                          {isSaving ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                        {!form.esPlanInicial && (
                          <button
                            onClick={() => marcarInicialMut.mutate(plan.tipo)}
                            disabled={marcarInicialMut.isPending}
                            title="Marcar como plan inicial para nuevas empresas"
                            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d97706', background: 'transparent', color: '#fbbf24', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            ⭐
                          </button>
                        )}
                        {savedMsg[plan.tipo] && (
                          <span style={{ fontSize: 12, color: '#34d399', fontWeight: 700 }}>{savedMsg[plan.tipo]}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ── Tab Órdenes N1CO ────────────────────────────────────────────────── */}
      {tab === 'ordenes' && (
        loadOrdenes ? (
          <LoadingState text="Cargando órdenes de N1CO..." />
        ) : (
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0f172a' }}>
                  {['OrderCode', 'Nombre', 'Total', 'Estado', 'Fecha'].map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: 'left', color: '#475569', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(ordenes as any[]).length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#475569' }}>Sin órdenes registradas en N1CO</td></tr>
                ) : (
                  ((ordenes as any)?.orders ?? ordenes ?? []).map((o: any) => (
                    <tr key={o.orderCode ?? o.orderId}
                      onMouseEnter={e => (e.currentTarget.style.background = '#253348')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      style={{ borderTop: '1px solid #0f172a', transition: 'background 0.1s' }}>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{o.orderCode}</td>
                      <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 500 }}>{o.name ?? o.orderName ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ color: '#34d399', fontWeight: 800 }}>${Number(o.totalAmount ?? o.amount ?? 0).toFixed(2)}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                          {o.status ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#475569', fontSize: 12 }}>
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-SV') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Tab Catálogo de Paquetes Extra ──────────────────────────────────── */}
      {tab === 'catalogo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>
              Paquetes disponibles para todas las empresas
            </p>
            <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>
              Aparecen en el modal "Comprar más DTEs". Cada paquete necesita sus planes en N1CO.
            </p>
          </div>

          {/* Form nuevo paquete catálogo */}
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 16px' }}>
              ➕ Añadir nuevo paquete al catálogo
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={labelStyle}>Nombre <span style={{ color: '#334155', fontWeight: 400 }}>(opcional)</span></label>
                <input value={nuevaOpcion.nombre} onChange={e => setNuevaOpcion(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Inicio, Pro..." style={{ ...inputStyle, marginTop: 4, width: 120 }} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad DTEs</label>
                <input type="number" min={1} value={nuevaOpcion.cantidad}
                  onChange={e => setNuevaOpcion(f => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))}
                  style={{ ...inputStyle, marginTop: 4, width: 100, fontWeight: 700 }} />
              </div>
              <div>
                <label style={labelStyle}>Precio USD</label>
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>$</span>
                  <input type="number" min={0} step={0.01} value={nuevaOpcion.precio}
                    onChange={e => setNuevaOpcion(f => ({ ...f, precio: parseFloat(e.target.value) || 0 }))}
                    style={{ ...inputStyle, paddingLeft: 20, marginTop: 0, width: 100, fontWeight: 700, color: '#34d399' }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Orden</label>
                <input type="number" min={0} value={nuevaOpcion.orden}
                  onChange={e => setNuevaOpcion(f => ({ ...f, orden: parseInt(e.target.value) || 0 }))}
                  style={{ ...inputStyle, marginTop: 4, width: 70 }} />
              </div>
              <button
                onClick={() => crearOpcionMut.mutate(nuevaOpcion)}
                disabled={crearOpcionMut.isPending || nuevaOpcion.cantidad < 1}
                style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', opacity: crearOpcionMut.isPending ? 0.6 : 1 }}
              >
                {crearOpcionMut.isPending ? 'Creando…' : '+ Añadir'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#334155', margin: '10px 0 0' }}>
              💡 Después de añadir, usa <strong style={{ color: '#818cf8' }}>"Crear en N1CO"</strong> para generar los links de pago automáticamente.
            </p>
          </div>

          {(catalogoOpciones as any[]).length === 0 ? (
            <EmptyState icon="📦" text="No hay paquetes en el catálogo" sub="Se mostrarán los valores por defecto (50/100/200/500 DTEs) hasta que añadas opciones personalizadas." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(catalogoOpciones as any[]).map((op: any) => {
                const hasUnaVez = !!op.paymentLinkUnaVez;
                const hasPermanente = !!op.paymentLinkPermanente;
                const isCreating = crearPlanesN1coMut.isPending && (crearPlanesN1coMut.variables as string) === op.id;
                return (
                  <div key={op.id} style={{
                    background: op.activo ? '#1e293b' : '#131e2e',
                    border: `1px solid ${op.activo ? '#334155' : '#1e293b'}`,
                    borderRadius: 10, padding: '14px 18px',
                    opacity: op.activo ? 1 : 0.5,
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        {op.nombre && (
                          <span style={{ background: '#312e81', color: '#c7d2fe', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {op.nombre}
                          </span>
                        )}
                        <span style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 17 }}>{op.cantidad} DTEs</span>
                        <span style={{ fontWeight: 800, color: '#34d399', fontSize: 17 }}>${Number(op.precio).toFixed(2)}</span>
                        {!op.activo && <span style={{ background: '#334155', color: '#475569', fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>Desactivado</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <PillStatus ok={hasUnaVez} label="Pago único" id={op.n1coPlanIdUnaVez} />
                        <PillStatus ok={hasPermanente} label="Mensual recurrente" id={op.n1coPlanIdPermanente} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          const tiene = hasUnaVez || hasPermanente;
                          if (!tiene || confirm(`¿Re-crear planes N1CO para "${op.cantidad} DTEs · $${Number(op.precio).toFixed(2)}"?`)) {
                            crearPlanesN1coMut.mutate(op.id);
                          }
                        }}
                        disabled={isCreating}
                        style={{
                          padding: '6px 14px', borderRadius: 6, cursor: isCreating ? 'not-allowed' : 'pointer',
                          border: 'none', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
                          background: (hasUnaVez && hasPermanente) ? '#1e293b' : '#312e81',
                          color: (hasUnaVez && hasPermanente) ? '#475569' : '#c7d2fe',
                          opacity: isCreating ? 0.6 : 1,
                          border_: `1px solid ${(hasUnaVez && hasPermanente) ? '#334155' : '#4338ca'}`,
                        } as any}
                      >
                        {isCreating ? '⏳ Creando…' : (hasUnaVez && hasPermanente) ? '🔄 Re-crear N1CO' : '🔗 Crear en N1CO'}
                      </button>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => toggleOpcionMut.mutate({ id: op.id, activo: !op.activo })}
                          style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${op.activo ? '#92400e' : '#065f46'}`, background: 'transparent', color: op.activo ? '#fbbf24' : '#34d399', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        >
                          {op.activo ? '⏸ Desactivar' : '▶ Activar'}
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar "${op.cantidad} DTEs · $${Number(op.precio).toFixed(2)}"?`)) eliminarOpcionMut.mutate(op.id); }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #7f1d1d', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Solicitudes / Paquetes extra ────────────────────────────────── */}
      {tab === 'paquetes' && (
        loadPaquetes ? (
          <LoadingState text="Cargando paquetes..." />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
              <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>
                Paquetes asignados a empresas específicas (solicitudes y activaciones manuales).
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => refetchPaquetes()}
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  ↻ Actualizar
                </button>
                <button
                  onClick={() => { setShowNuevoPaquete(true); setNuevoPaqueteForm({ ...NUEVO_PKG_EMPTY }); setBusquedaEmpresa(''); }}
                  style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}
                >
                  ➕ Añadir paquete
                </button>
              </div>
            </div>

            {(paquetesExtra as any[]).length === 0 ? (
              <EmptyState icon="📋" text="No hay paquetes extra solicitados" />
            ) : (
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#0f172a' }}>
                      {['Empresa', 'Cantidad', 'Tipo', 'Precio', 'Estado', 'Fecha', 'Acciones'].map(h => (
                        <th key={h} style={{ padding: '11px 16px', textAlign: 'left', color: '#475569', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(paquetesExtra as any[]).map((p: any) => {
                      const ec = ESTADO_COLOR[p.estado] ?? ESTADO_COLOR.CANCELADO;
                      const isActivating = activarPaqueteMut.isPending && (activarPaqueteMut.variables as string) === p.id;
                      const isCanceling  = cancelarPaqueteMut.isPending && (cancelarPaqueteMut.variables as string) === p.id;
                      const emp = (empresasList as any[]).find((e: any) => e.id === p.empresaId);
                      return (
                        <tr key={p.id}
                          onMouseEnter={e => (e.currentTarget.style.background = '#253348')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          style={{ borderTop: '1px solid #0f172a', transition: 'background 0.1s' }}>
                          <td style={{ padding: '12px 16px' }}>
                            {emp ? (
                              <>
                                <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{emp.nombreComercial || emp.nombreLegal}</div>
                                <div style={{ color: '#334155', fontSize: 10, fontFamily: 'monospace' }}>{p.empresaId?.slice(0, 8)}…</div>
                              </>
                            ) : (
                              <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: 11 }}>{p.empresaId?.slice(0, 8)}…</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{p.cantidad}</span>
                            <span style={{ color: '#475569', fontSize: 11 }}> DTEs</span>
                            <div style={{ fontSize: 10, color: '#334155' }}>Usados: {p.usado}</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {p.esPermanente ? (
                              <span style={{ background: '#1e1b4b', color: '#c7d2fe', border: '1px solid #3730a3', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Permanente</span>
                            ) : (
                              <span style={{ background: '#0c2a45', color: '#7dd3fc', border: '1px solid #075985', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Una vez</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ color: '#34d399', fontWeight: 800 }}>${Number(p.precio).toFixed(2)}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ background: ec.bg, color: ec.color, border: `1px solid ${ec.border}`, padding: '3px 10px', borderRadius: 20, fontWeight: 700, fontSize: 11 }}>{p.estado}</span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#475569', fontSize: 12 }}>
                            {new Date(p.createdAt).toLocaleDateString('es-SV')}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              {p.estado === 'PENDIENTE' && (
                                <>
                                  <button
                                    onClick={() => { setEditPaquete(p); setEditPaqueteForm({ cantidad: p.cantidad, precio: p.precio, esPermanente: p.esPermanente, notas: p.notas ?? '' }); }}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #4338ca', background: 'transparent', color: '#818cf8', cursor: 'pointer', fontWeight: 600, fontSize: 11 }}
                                  >✏️ Editar</button>
                                  <button
                                    onClick={() => activarPaqueteMut.mutate(p.id)}
                                    disabled={isActivating}
                                    style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#065f46', color: '#34d399', cursor: 'pointer', fontWeight: 700, fontSize: 11, opacity: isActivating ? 0.6 : 1 }}
                                  >{isActivating ? '...' : '✅ Activar'}</button>
                                </>
                              )}
                              {(p.estado === 'PENDIENTE' || p.estado === 'PAGADO') && (
                                <button
                                  onClick={() => cancelarPaqueteMut.mutate(p.id)}
                                  disabled={isCanceling}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #7f1d1d', background: 'transparent', color: '#f87171', cursor: 'pointer', fontWeight: 600, fontSize: 11, opacity: isCanceling ? 0.6 : 1 }}
                                >{isCanceling ? '...' : 'Cancelar'}</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}

      {/* ── Modal: Nuevo plan ────────────────────────────────────────────────── */}
      {showNuevo && (
        <div style={overlayStyle} onClick={() => setShowNuevo(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <ModalHeader title="➕ Crear nuevo plan" onClose={() => setShowNuevo(false)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Clave del plan <span style={{ color: '#334155', fontWeight: 400 }}>(ej: TRIAL, PYME, PROMO)</span></label>
                <input value={nuevoForm.tipo}
                  onChange={e => setNuevo('tipo', e.target.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="TRIAL" style={{ ...inputStyle, marginTop: 4 }} />
              </div>
              <div>
                <label style={labelStyle}>Nombre visible</label>
                <input value={nuevoForm.nombre} onChange={e => setNuevo('nombre', e.target.value)} placeholder="Plan Trial" style={{ ...inputStyle, marginTop: 4 }} />
              </div>
              <div>
                <label style={labelStyle}>Descripción</label>
                <input value={nuevoForm.descripcion} onChange={e => setNuevo('descripcion', e.target.value)} placeholder="30 días gratis · 50 DTEs" style={{ ...inputStyle, marginTop: 4 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Precio/mes ($)</label>
                  <input type="number" min={0} step={0.01} value={nuevoForm.precioMensual} onChange={e => setNuevo('precioMensual', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <div>
                  <label style={labelStyle}>DTEs/mes</label>
                  <input type="number" min={1} value={nuevoForm.limiteDtesMensuales} onChange={e => setNuevo('limiteDtesMensuales', parseInt(e.target.value) || 1)} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <div>
                  <label style={labelStyle}>Usuarios</label>
                  <input type="number" min={1} value={nuevoForm.limiteUsuarios} onChange={e => setNuevo('limiteUsuarios', parseInt(e.target.value) || 1)} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Plan ID N1CO</label>
                  <input type="number" value={nuevoForm.n1coPlanId} onChange={e => setNuevo('n1coPlanId', e.target.value)} placeholder="—" style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <div>
                  <label style={labelStyle}>Link de pago N1CO</label>
                  <input value={nuevoForm.paymentLinkUrl} onChange={e => setNuevo('paymentLinkUrl', e.target.value)} placeholder="https://pay.n1co.shop/pl/..." style={{ ...inputStyle, marginTop: 4, fontSize: 12 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={nuevoForm.activo} onChange={e => setNuevo('activo', e.target.checked)} />
                  Activo
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fbbf24', cursor: 'pointer' }}>
                  <input type="checkbox" checked={nuevoForm.esPlanInicial} onChange={e => setNuevo('esPlanInicial', e.target.checked)} />
                  ⭐ Plan inicial (asignar a nuevas empresas)
                </label>
              </div>
              {crearPlanMut.isError && (
                <div style={{ color: '#f87171', fontSize: 13, background: '#450a0a', borderRadius: 8, padding: '8px 12px' }}>
                  Error: {(crearPlanMut.error as any)?.response?.data?.message ?? 'No se pudo crear el plan'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setShowNuevo(false)} style={btnSecondary}>Cancelar</button>
                <button
                  onClick={() => crearPlanMut.mutate({ ...nuevoForm, n1coPlanId: nuevoForm.n1coPlanId ? Number(nuevoForm.n1coPlanId) : null, paymentLinkUrl: nuevoForm.paymentLinkUrl || null })}
                  disabled={!nuevoForm.nombre || crearPlanMut.isPending}
                  style={{ ...btnPrimary, flex: 2, opacity: (!nuevoForm.nombre || crearPlanMut.isPending) ? 0.6 : 1 }}
                >
                  {crearPlanMut.isPending ? 'Creando...' : 'Crear plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Nuevo paquete (superadmin) ───────────────────────────────── */}
      {showNuevoPaquete && (() => {
        const empresasFiltradas = (empresasList as any[]).filter(e => {
          if (!busquedaEmpresa) return true;
          const q = busquedaEmpresa.toLowerCase();
          return (e.nombreComercial ?? '').toLowerCase().includes(q)
            || (e.nombreLegal ?? '').toLowerCase().includes(q)
            || (e.id ?? '').toLowerCase().includes(q);
        });
        const empresaSel = (empresasList as any[]).find((e: any) => e.id === nuevoPaqueteForm.empresaId);
        return (
          <div style={overlayStyle} onClick={() => setShowNuevoPaquete(false)}>
            <div style={{ ...modalStyle, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
              <ModalHeader title="➕ Añadir paquete extra" onClose={() => setShowNuevoPaquete(false)} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Empresa</label>
                  {empresaSel ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, padding: '10px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #4338ca' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{empresaSel.nombreComercial || empresaSel.nombreLegal}</div>
                        <div style={{ color: '#475569', fontSize: 10, fontFamily: 'monospace' }}>{empresaSel.id}</div>
                      </div>
                      <button onClick={() => setNuevoPaqueteForm(f => ({ ...f, empresaId: '' }))} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input placeholder="Buscar empresa por nombre o ID..." value={busquedaEmpresa}
                        onChange={e => setBusquedaEmpresa(e.target.value)}
                        style={{ ...inputStyle, marginTop: 4 }} autoFocus />
                      {busquedaEmpresa && (
                        <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 4, background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}>
                          {empresasFiltradas.length === 0 ? (
                            <div style={{ padding: '10px 12px', color: '#475569', fontSize: 13 }}>Sin resultados</div>
                          ) : empresasFiltradas.slice(0, 8).map((e: any) => (
                            <div key={e.id}
                              onClick={() => { setNuevoPaqueteForm(f => ({ ...f, empresaId: e.id })); setBusquedaEmpresa(''); }}
                              style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #1e293b' }}
                              onMouseEnter={ev => (ev.currentTarget.style.background = '#1e293b')}
                              onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                            >
                              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{e.nombreComercial || e.nombreLegal}</div>
                              <div style={{ color: '#475569', fontSize: 10, fontFamily: 'monospace' }}>{e.id.slice(0, 12)}…</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Cantidad de DTEs</label>
                    <input type="number" min={1} value={nuevoPaqueteForm.cantidad}
                      onChange={e => setNuevoPaqueteForm(f => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))}
                      style={{ ...inputStyle, marginTop: 4, fontSize: 16, fontWeight: 800, color: '#e2e8f0' }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Precio (USD)</label>
                    <div style={{ position: 'relative', marginTop: 4 }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }}>$</span>
                      <input type="number" min={0} step={0.01} value={nuevoPaqueteForm.precio}
                        onChange={e => setNuevoPaqueteForm(f => ({ ...f, precio: parseFloat(e.target.value) || 0 }))}
                        style={{ ...inputStyle, paddingLeft: 22, marginTop: 0, fontSize: 16, fontWeight: 800, color: '#34d399' }} />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ ...labelStyle, marginBottom: 6, display: 'block' }}>Atajos rápidos</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[{ c: 10, p: 1 }, { c: 25, p: 2 }, { c: 50, p: 5 }, { c: 100, p: 9 }, { c: 200, p: 16 }, { c: 500, p: 35 }].map(({ c, p }) => {
                      const sel = nuevoPaqueteForm.cantidad === c && nuevoPaqueteForm.precio === p;
                      return (
                        <button key={c} type="button"
                          onClick={() => setNuevoPaqueteForm(f => ({ ...f, cantidad: c, precio: p }))}
                          style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600, border: `1px solid ${sel ? '#6366f1' : '#334155'}`, background: sel ? '#312e81' : '#0f172a', color: sel ? '#c7d2fe' : '#475569' }}
                        >{c} DTEs · ${p}</button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Tipo</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {[{ val: false, label: '🔵 Una sola vez', sub: 'Solo este mes' }, { val: true, label: '🟣 Permanente', sub: 'Sube límite mensual' }].map(opt => {
                      const sel = nuevoPaqueteForm.esPermanente === opt.val;
                      return (
                        <button key={String(opt.val)} type="button"
                          onClick={() => setNuevoPaqueteForm(f => ({ ...f, esPermanente: opt.val }))}
                          style={{ flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: `2px solid ${sel ? '#6366f1' : '#334155'}`, background: sel ? '#1e1b4b' : '#0f172a', color: sel ? '#e0e7ff' : '#475569' }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                          <div style={{ fontSize: 11, marginTop: 2 }}>{opt.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notas internas <span style={{ color: '#334155', fontWeight: 400 }}>(opcional)</span></label>
                  <input value={nuevoPaqueteForm.notas}
                    onChange={e => setNuevoPaqueteForm(f => ({ ...f, notas: e.target.value }))}
                    placeholder="Ej: cortesía, promoción, reposición..."
                    style={{ ...inputStyle, marginTop: 4 }} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${nuevoPaqueteForm.activarInmediatamente ? '#065f46' : '#334155'}`, background: nuevoPaqueteForm.activarInmediatamente ? '#022c22' : '#0f172a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={nuevoPaqueteForm.activarInmediatamente}
                    onChange={e => setNuevoPaqueteForm(f => ({ ...f, activarInmediatamente: e.target.checked }))}
                    style={{ accentColor: '#10b981', width: 16, height: 16 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>Activar inmediatamente</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>Si está marcado, el paquete queda activo al instante. Si no, queda como PENDIENTE.</div>
                  </div>
                </label>

                {crearPaqueteAdminMut.isError && (
                  <div style={{ color: '#f87171', fontSize: 13, background: '#450a0a', borderRadius: 8, padding: '8px 12px' }}>
                    {(crearPaqueteAdminMut.error as any)?.response?.data?.message ?? 'Error al crear el paquete'}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={() => setShowNuevoPaquete(false)} style={btnSecondary}>Cancelar</button>
                  <button
                    onClick={() => crearPaqueteAdminMut.mutate(nuevoPaqueteForm)}
                    disabled={!nuevoPaqueteForm.empresaId || crearPaqueteAdminMut.isPending}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (!nuevoPaqueteForm.empresaId || crearPaqueteAdminMut.isPending) ? 0.5 : 1 }}
                  >
                    {crearPaqueteAdminMut.isPending ? 'Creando…' : `Crear · ${nuevoPaqueteForm.cantidad} DTEs · $${nuevoPaqueteForm.precio}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal: Editar paquete extra ──────────────────────────────────────── */}
      {editPaquete && (
        <div style={overlayStyle} onClick={() => setEditPaquete(null)}>
          <div style={{ ...modalStyle, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <ModalHeader title="✏️ Editar paquete extra" onClose={() => setEditPaquete(null)} />
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Empresa: </span>
              <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{editPaquete.empresaId}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Cantidad de DTEs</label>
                <select value={editPaqueteForm.cantidad}
                  onChange={e => { const cant = parseInt(e.target.value); const precios: Record<number, number> = { 50: 5, 100: 9, 200: 16, 500: 35 }; setEditPaqueteForm(f => ({ ...f, cantidad: cant, precio: precios[cant] ?? f.precio })); }}
                  style={{ ...inputStyle, marginTop: 4 }}>
                  {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n} DTEs</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Precio (USD)</label>
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }}>$</span>
                  <input type="number" min={0} step={0.01} value={editPaqueteForm.precio}
                    onChange={e => setEditPaqueteForm(f => ({ ...f, precio: parseFloat(e.target.value) || 0 }))}
                    style={{ ...inputStyle, paddingLeft: 22, marginTop: 0, color: '#34d399', fontWeight: 800 }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Tipo</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {[{ val: false, label: '🔵 Una sola vez', sub: 'Solo este mes' }, { val: true, label: '🟣 Permanente', sub: 'Aumenta límite mensual' }].map(opt => {
                    const sel = editPaqueteForm.esPermanente === opt.val;
                    return (
                      <button key={String(opt.val)} type="button"
                        onClick={() => setEditPaqueteForm(f => ({ ...f, esPermanente: opt.val }))}
                        style={{ flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', border: `2px solid ${sel ? '#6366f1' : '#334155'}`, background: sel ? '#1e1b4b' : '#0f172a', color: sel ? '#e0e7ff' : '#475569' }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Notas internas <span style={{ color: '#334155', fontWeight: 400 }}>(opcional)</span></label>
                <input value={editPaqueteForm.notas}
                  onChange={e => setEditPaqueteForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Ej: descuento por cliente frecuente"
                  style={{ ...inputStyle, marginTop: 4 }} />
              </div>
              {editarPaqueteMut.isError && (
                <div style={{ color: '#f87171', fontSize: 13, background: '#450a0a', borderRadius: 8, padding: '8px 12px' }}>
                  {(editarPaqueteMut.error as any)?.response?.data?.message ?? 'Error al guardar'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setEditPaquete(null)} style={btnSecondary}>Cancelar</button>
                <button
                  onClick={() => editarPaqueteMut.mutate({ id: editPaquete.id, data: editPaqueteForm })}
                  disabled={editarPaqueteMut.isPending}
                  style={{ ...btnPrimary, flex: 2, opacity: editarPaqueteMut.isPending ? 0.6 : 1 }}
                >
                  {editarPaqueteMut.isPending ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar eliminar ────────────────────────────────────────── */}
      {confirmDelete && (
        <div style={overlayStyle} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...modalStyle, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#450a0a', border: '1px solid #7f1d1d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🗑️</div>
            </div>
            <h3 style={{ color: '#f87171', marginBottom: 8, textAlign: 'center', fontSize: 17 }}>Eliminar plan</h3>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24, textAlign: 'center' }}>
              ¿Eliminar el plan <strong style={{ color: '#e2e8f0' }}>{confirmDelete}</strong>? Esta acción no puede deshacerse.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ ...btnSecondary, flex: 1 }}>Cancelar</button>
              <button
                onClick={() => eliminarPlanMut.mutate(confirmDelete!)}
                disabled={eliminarPlanMut.isPending}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
              >
                {eliminarPlanMut.isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, iconBg, iconColor, label, value, valueColor, sub }: {
  icon: string; iconBg: string; iconColor: string;
  label: string; value: string; valueColor: string; sub: string;
}) {
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
      padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
    }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: valueColor, lineHeight: 1, letterSpacing: -1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#334155', marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
}

function PillStatus({ ok, label, id }: { ok: boolean; label: string; id?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
      borderRadius: 6, fontSize: 11,
      background: ok ? '#022c22' : '#1c0a00',
      border: `1px solid ${ok ? '#065f46' : '#78350f'}`,
      color: ok ? '#34d399' : '#fbbf24',
    }}>
      <span>{ok ? '✅' : '⚠️'}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {ok && id && <span style={{ color: '#334155', fontFamily: 'monospace', fontSize: 10 }}>#{id}</span>}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#334155' }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>⏳</div>
      <div style={{ fontSize: 14, color: '#475569' }}>{text}</div>
    </div>
  );
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#1e293b', borderRadius: 12, border: '1px dashed #334155' }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ color: '#475569', fontSize: 14, marginBottom: sub ? 6 : 0 }}>{text}</div>
      {sub && <div style={{ color: '#334155', fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
      <h2 style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 18, margin: 0 }}>{title}</h2>
      <button onClick={onClose} style={{ background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
    </div>
  );
}

// ── Estilos reutilizables ─────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', marginTop: 4, padding: '8px 10px',
  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
  color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box',
  outline: 'none',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  backdropFilter: 'blur(2px)',
};

const modalStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
  padding: 32, width: '90%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
};

const btnSecondary: React.CSSProperties = {
  flex: 1, padding: '10px 0', borderRadius: 8,
  border: '1px solid #334155', background: 'transparent',
  color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 14,
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 0', borderRadius: 8, border: 'none',
  background: '#6366f1', color: '#fff',
  fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
