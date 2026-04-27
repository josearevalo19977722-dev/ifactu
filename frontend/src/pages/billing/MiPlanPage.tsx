import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';
import { PaqueteExtraModal } from '../../components/PaqueteExtraModal';
import './MiPlanPage.css';

const PLAN_LABELS: Record<string, string> = {
  BASICA:       'Plan Básico',
  PROFESIONAL:  'Plan Profesional',
  EMPRESA:      'Plan Empresa',
  CUSTOM:       'Plan Personalizado',
};

const PLAN_ICONS: Record<string, string> = {
  BASICA:       '🌱',
  PROFESIONAL:  '🚀',
  EMPRESA:      '🏢',
  CUSTOM:       '⚙️',
};

const ESTADO_COLOR: Record<string, string> = {
  ACTIVA:     '#10b981',
  SUSPENDIDA: '#ef4444',
  VENCIDA:    '#f59e0b',
  CANCELADA:  '#6b7280',
};

export function MiPlanPage() {
  const qc = useQueryClient();
  const [planSeleccionado, setPlanSeleccionado] = useState<string | null>(null);
  const [redirigiendo, setRedirigiendo] = useState(false);
  const [showPaqueteModal, setShowPaqueteModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['mi-plan'],
    queryFn: () => apiClient.get('/billing/mi-plan').then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: extrasData } = useQuery({
    queryKey: ['paquetes-extras-disponibles'],
    queryFn: () => apiClient.get('/billing/paquetes-extras/disponibles').then(r => r.data),
    refetchInterval: 60_000,
  });

  const iniciarPago = useMutation({
    mutationFn: (planTipo: string) =>
      apiClient.post('/billing/iniciar-pago', { planTipo }).then(r => r.data),
    onSuccess: (result) => {
      setRedirigiendo(false);
      // Abrir el link de pago N1CO en nueva pestaña
      window.open(result.paymentLinkUrl, '_blank');
    },
    onError: () => setRedirigiendo(false),
  });

  function handleContratarPlan(planTipo: string) {
    setPlanSeleccionado(planTipo);
    setRedirigiendo(true);
    iniciarPago.mutate(planTipo);
  }

  if (isLoading) {
    return (
      <div className="mi-plan-loading">
        <div className="spinner" />
      </div>
    );
  }

  const { suscripcion, uso, planesDisponibles } = data ?? {};
  const planActualKey = suscripcion?.tipo;

  // Precio vigente desde la config actual (no el histórico guardado en la suscripción)
  const planesArray: any[] = Array.isArray(planesDisponibles)
    ? planesDisponibles
    : Object.entries(planesDisponibles ?? {}).map(([tipo, p]: [string, any]) => ({ tipo, ...p }));
  const configPlanActual = planesArray.find(p => p.tipo === planActualKey);
  const precioBasePlan = configPlanActual
    ? Number(configPlanActual.precioMensual ?? configPlanActual.monto ?? 0)
    : Number(suscripcion?.precioMensual ?? 0);

  // Sumar precios de paquetes extras permanentes activos al precio mensual
  const extrasPermanentes: any[] = (extrasData?.paquetes ?? []).filter((p: any) => p.esPermanente);
  const precioExtrasPermanentes = extrasPermanentes.reduce((sum: number, p: any) => sum + Number(p.precio ?? 0), 0);
  const precioActual = precioBasePlan + precioExtrasPermanentes;

  return (
    <div className="mi-plan-page">
      <h1 className="mi-plan-title">Mi Plan</h1>

      {/* ── Plan actual ─────────────────────────────────────────────────── */}
      <div className="mi-plan-card current-plan">
        <div className="current-plan-header">
          <div>
            <span className="plan-icon">{PLAN_ICONS[planActualKey ?? ''] ?? '📋'}</span>
            <span className="current-plan-name">
              {suscripcion
                ? (configPlanActual?.nombre ?? PLAN_LABELS[suscripcion.tipo] ?? suscripcion.tipo)
                : 'Sin plan activo'}
            </span>
            {suscripcion && (
              <span
                className="plan-estado-badge"
                style={{ background: ESTADO_COLOR[suscripcion.estado] ?? '#6b7280' }}
              >
                {suscripcion.estado}
              </span>
            )}
          </div>
          {suscripcion && (
            <div className="plan-precio-actual">
              ${precioActual.toFixed(2)}<span>/mes</span>
              {precioExtrasPermanentes > 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginTop: 2 }}>
                  Plan ${precioBasePlan.toFixed(2)} + extras ${precioExtrasPermanentes.toFixed(2)}
                </div>
              )}
            </div>
          )}
        </div>

        {suscripcion ? (
          <div className="plan-info-grid">
            <div className="plan-info-item">
              <span className="label">Vence</span>
              <span className="value">
                {new Date(suscripcion.fechaVencimiento).toLocaleDateString('es-SV')}
                {suscripcion.diasRestantes <= 7 && (
                  <span className="warning-badge">⚠️ {suscripcion.diasRestantes} días</span>
                )}
              </span>
            </div>
            <div className="plan-info-item">
              <span className="label">DTEs este mes</span>
              <span className="value">
                {uso?.dtesUsados ?? 0} / {(uso?.dtesLimite ?? 0) + (extrasData?.disponibles ?? 0)}
                {(extrasData?.disponibles ?? 0) > 0 && (
                  <span style={{ fontSize: 11, color: '#10b981', marginLeft: 6, fontWeight: 600 }}>
                    (+{extrasData.disponibles} extra)
                  </span>
                )}
              </span>
            </div>
            <div className="plan-info-item">
              <span className="label">Usuarios permitidos</span>
              <span className="value">{suscripcion.limiteUsuarios}</span>
            </div>
          </div>
        ) : (
          <p className="no-plan-text">
            No tienes ningún plan activo. Selecciona uno para continuar emitiendo DTEs.
          </p>
        )}

        {/* Barra de uso — solo si hay plan activo */}
        {uso && suscripcion && (() => {
          const extras = extrasData?.disponibles ?? 0;
          const limiteTotal = uso.dtesLimite + extras;
          const pct = limiteTotal > 0 ? Math.round((uso.dtesUsados / limiteTotal) * 100) : 0;
          const pctBase = limiteTotal > 0 ? Math.round((Math.min(uso.dtesUsados, uso.dtesLimite) / limiteTotal) * 100) : 0;
          const pctExtra = extras > 0 && uso.dtesUsados > uso.dtesLimite
            ? Math.round(((uso.dtesUsados - uso.dtesLimite) / limiteTotal) * 100) : 0;
          return (
            <div className="uso-bar-wrap">
              <div className="uso-bar-label">
                <span>Uso de DTEs este mes</span>
                <span>
                  {uso.dtesUsados} / {limiteTotal} ({pct}%)
                  {extras > 0 && <span style={{ color: '#64748b', fontSize: 11 }}> · {uso.dtesLimite} plan + {extras} extra</span>}
                </span>
              </div>
              <div className="uso-bar" style={{ position: 'relative' }}>
                {/* Segmento plan base */}
                <div className="uso-bar-fill" style={{
                  width: `${pctBase}%`,
                  background: pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#10b981',
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                }} />
                {/* Segmento extra (si usó más allá del plan) */}
                {pctExtra > 0 && (
                  <div style={{
                    width: `${pctExtra}%`,
                    background: '#6366f1',
                    position: 'absolute', left: `${pctBase}%`, top: 0, bottom: 0,
                  }} />
                )}
                {/* Línea divisoria plan/extra */}
                {extras > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: `${Math.round((uso.dtesLimite / limiteTotal) * 100)}%`,
                    top: 0, bottom: 0, width: 2,
                    background: '#334155',
                    zIndex: 2,
                  }} />
                )}
              </div>
              {extras > 0 && (
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
                    Plan ({uso.dtesLimite} DTEs)
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1', display: 'inline-block' }} />
                    Extra ({extras} DTEs)
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── DTEs extra disponibles ──────────────────────────────────────── */}
      <div className="mi-plan-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            DTEs adicionales disponibles
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: (extrasData?.disponibles ?? 0) > 0 ? '#10b981' : '#64748b' }}>
            {extrasData?.disponibles ?? 0}
            <span style={{ fontSize: 14, fontWeight: 400, color: '#64748b', marginLeft: 6 }}>DTEs extra</span>
          </div>
          {(extrasData?.disponibles ?? 0) === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Sin paquetes extras activos
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowPaqueteModal(true)}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ➕ Comprar más DTEs
        </button>
      </div>

      <PaqueteExtraModal
        open={showPaqueteModal}
        onClose={() => {
          setShowPaqueteModal(false);
          qc.invalidateQueries({ queryKey: ['paquetes-extras-disponibles'] });
        }}
        usados={uso?.dtesUsados ?? 0}
        limite={uso?.dtesLimite ?? 0}
      />

      {/* ── Planes disponibles ──────────────────────────────────────────── */}
      <h2 className="planes-title">Planes disponibles</h2>
      <div className="planes-grid">
        {planesDisponibles && (Array.isArray(planesDisponibles) ? planesDisponibles : Object.entries(planesDisponibles).map(([tipo, p]: [string, any]) => ({ tipo, ...p }))).map((plan: any) => {
          const tipo     = plan.tipo ?? plan.key;
          const precio   = Number(plan.precioMensual ?? plan.monto ?? 0);
          const limDtes  = plan.limiteDtesMensuales ?? plan.limiteDtes ?? 0;
          const limUsers = plan.limiteUsuarios ?? 0;
          const esActual = tipo === planActualKey;
          const esMejor  = !planActualKey ||
            (planActualKey === 'BASICA' && tipo !== 'BASICA') ||
            (planActualKey === 'PROFESIONAL' && tipo === 'EMPRESA');

          return (
            <div
              key={tipo}
              className={`plan-card ${esActual ? 'plan-card--actual' : ''} ${tipo === 'PROFESIONAL' ? 'plan-card--popular' : ''}`}
            >
              {tipo === 'PROFESIONAL' && <div className="plan-popular-badge">⭐ Más popular</div>}
              {esActual && <div className="plan-actual-badge">Plan actual</div>}

              <div className="plan-card-icon">{PLAN_ICONS[tipo]}</div>
              <h3 className="plan-card-name">{plan.nombre}</h3>
              <div className="plan-card-precio">
                <span className="precio-monto">${precio.toFixed(2)}</span>
                <span className="precio-periodo">/mes</span>
              </div>
              <p className="plan-card-desc">{plan.descripcion}</p>

              <ul className="plan-features">
                <li>✅ {limDtes.toLocaleString()} DTEs/mes</li>
                <li>✅ {limUsers} usuarios</li>
                {tipo !== 'BASICA' && <li>✅ Factura de Exportación</li>}
                {tipo === 'EMPRESA' && <li>✅ Multi-moneda</li>}
              </ul>

              <button
                className={`plan-btn ${esActual ? 'plan-btn--disabled' : esMejor ? 'plan-btn--upgrade' : 'plan-btn--default'}`}
                disabled={esActual || redirigiendo}
                onClick={() => handleContratarPlan(tipo)}
              >
                {redirigiendo && planSeleccionado === tipo
                  ? '⏳ Preparando...'
                  : esActual
                  ? 'Plan actual'
                  : esMejor
                  ? '⬆️ Mejorar plan'
                  : 'Contratar'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="billing-nota">
        Al hacer clic en "Mejorar plan" serás redirigido de forma segura al portal de pago de{' '}
        <strong>N1CO</strong>. Una vez confirmado el pago, tu plan se activará automáticamente.
      </p>
    </div>
  );
}
