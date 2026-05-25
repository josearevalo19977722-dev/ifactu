import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

interface Plan {
  tipo: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  maxDtesMes: number;
  maxDispositivos: number;
  paymentLinkUrl: string | null;
}

const ICONOS: Record<string, string> = {
  monthly:    '📅',
  annual:     '🗓️',
  lifetime_1: '♾️',
  lifetime_2: '♾️',
  lifetime_5: '♾️',
};

const POPULAR = 'annual'; // plan destacado

const FEATURES = [
  '📥 Descarga DTEs automáticamente desde Gmail',
  '📄 Soporte para CF, CCF, NRE, FSE y más tipos de DTE',
  '🔍 Detecta y organiza adjuntos JSON + PDF en segundos',
  '🤖 Autopilot: escanea tu bandeja sin intervención manual',
  '🔒 Tus datos nunca salen de tu equipo',
  '🔄 Actualizaciones incluidas',
];

export function ExtensionStorePage() {
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState<string | null>(null);

  const { data: planes = [], isLoading } = useQuery<Plan[]>({
    queryKey: ['extension-planes-publicos'],
    queryFn: () => apiClient.get('/extension/planes').then(r => r.data),
  });

  const comprar = async (plan: Plan) => {
    if (!plan.paymentLinkUrl) {
      alert('Este plan no está disponible aún. Contáctanos en jsolution.sv@gmail.com');
      return;
    }
    setCargando(plan.tipo);
    let url = plan.paymentLinkUrl;
    if (email.trim()) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}email=${encodeURIComponent(email.trim())}`;
    }
    window.open(url, '_blank');
    setCargando(null);
  };

  const s = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    } as React.CSSProperties,
    container: { maxWidth: 1000, margin: '0 auto', padding: '0 20px' } as React.CSSProperties,
  };

  return (
    <div style={s.page}>

      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', padding: '72px 20px 48px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.3)', borderRadius: 99, padding: '6px 16px', marginBottom: 24 }}>
          <span style={{ fontSize: 18 }}>🧩</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc' }}>Extensión Chrome para Contadores</span>
        </div>

        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, margin: '0 0 16px', lineHeight: 1.15 }}>
          Descarga tus DTEs<br />
          <span style={{ background: 'linear-gradient(90deg, #818cf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            sin esfuerzo
          </span>
        </h1>
        <p style={{ fontSize: 18, color: '#94a3b8', maxWidth: 520, margin: '0 auto 40px', lineHeight: 1.6 }}>
          iFactu_Conta detecta y organiza tus comprobantes fiscales electrónicos directamente desde Gmail.
        </p>

        {/* Features */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, maxWidth: 700, margin: '0 auto 56px', textAlign: 'left' }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Email opcional ── */}
      <div style={{ ...s.container, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, maxWidth: 380, width: '100%' }}>
          <label style={{ fontSize: 12, color: '#94a3b8', textAlign: 'left' }}>
            Tu correo (opcional — para recibir la clave al instante)
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tucorreo@empresa.com"
            style={{
              padding: '10px 16px', borderRadius: 10,
              border: '1px solid rgba(99,102,241,.4)',
              background: 'rgba(255,255,255,.12)',
              color: '#f8fafc', fontSize: 14,
              outline: 'none',
              boxShadow: '0 0 0 0 transparent',
            }}
          />
        </div>
      </div>

      {/* ── Planes ── */}
      <div style={{ ...s.container, paddingBottom: 80 }}>
        {isLoading && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Cargando planes…</div>
        )}

        {!isLoading && planes.length === 0 && (
          <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.05)', borderRadius: 16, padding: '40px 24px', color: '#94a3b8' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Planes próximamente</div>
            <div style={{ fontSize: 13 }}>Estamos configurando los planes. Escríbenos a <a href="mailto:jsolution.sv@gmail.com" style={{ color: '#818cf8' }}>jsolution.sv@gmail.com</a></div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
          {planes.map(plan => {
            const esPopular = plan.tipo === POPULAR;
            const esVitalicio = plan.tipo.startsWith('lifetime');
            return (
              <div
                key={plan.tipo}
                style={{
                  position: 'relative',
                  background: esPopular
                    ? 'linear-gradient(160deg, rgba(99,102,241,.25), rgba(124,58,237,.2))'
                    : 'rgba(255,255,255,.05)',
                  border: esPopular
                    ? '1px solid rgba(99,102,241,.6)'
                    : '1px solid rgba(255,255,255,.08)',
                  borderRadius: 20,
                  padding: '28px 24px 24px',
                  transition: 'transform .2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = '')}
              >
                {esPopular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                    color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px',
                    borderRadius: 99, whiteSpace: 'nowrap',
                  }}>
                    ⭐ MÁS POPULAR
                  </div>
                )}

                <div style={{ fontSize: 28, marginBottom: 8 }}>{ICONOS[plan.tipo] ?? '📦'}</div>
                <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{plan.nombre}</div>
                {plan.descripcion && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16, lineHeight: 1.5 }}>{plan.descripcion}</div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: esPopular ? '#a5b4fc' : '#f8fafc' }}>
                    ${Number(plan.precio).toFixed(2)}
                  </span>
                  <span style={{ fontSize: 13, color: '#64748b', marginLeft: 6 }}>
                    {plan.tipo === 'monthly' ? '/ mes' : plan.tipo === 'annual' ? '/ año' : 'pago único'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, fontSize: 13, color: '#cbd5e1' }}>
                  <div>📄 {plan.maxDtesMes === 0 ? 'DTEs ilimitados' : `${plan.maxDtesMes} DTEs/mes`}</div>
                  <div>🖥️ {plan.maxDispositivos} {plan.maxDispositivos === 1 ? 'equipo' : 'equipos'}</div>
                  <div>✅ Gmail</div>
                  {esVitalicio && <div style={{ color: '#86efac' }}>♾️ Sin suscripción mensual</div>}
                  {plan.tipo === 'annual' && <div style={{ color: '#86efac' }}>💰 Ahorra vs plan mensual</div>}
                </div>

                <button
                  disabled={cargando === plan.tipo}
                  onClick={() => comprar(plan)}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 12,
                    cursor: cargando === plan.tipo ? 'wait' : 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    background: esPopular
                      ? 'linear-gradient(90deg, #6366f1, #a855f7)'
                      : 'rgba(99,102,241,.2)',
                    color: '#fff',
                    border: esPopular ? 'none' : '1px solid rgba(99,102,241,.4)',
                    transition: 'opacity .2s',
                    opacity: cargando === plan.tipo ? 0.7 : 1,
                  } as React.CSSProperties}
                >
                  {cargando === plan.tipo ? 'Redirigiendo…' : plan.paymentLinkUrl ? '🛒 Comprar ahora' : 'Próximamente'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 48, color: '#64748b', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {/* Logo N1CO */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
            <span>🔒 Pago seguro procesado por</span>
            <img
              src="https://n1co.shop/n1co-logo.png"
              alt="N1CO"
              style={{ height: 18, verticalAlign: 'middle', filter: 'brightness(0) invert(.6)' }}
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                (e.currentTarget.nextSibling as HTMLElement).style.display = 'inline';
              }}
            />
            <span style={{ display: 'none', fontWeight: 700, color: '#94a3b8', letterSpacing: 1 }}>N1CO</span>
            <span style={{ color: '#475569' }}>· Cancela cuando quieras</span>
          </div>
          <div>
            ¿Tienes preguntas? Escríbenos a{' '}
            <a href="mailto:jsolution.sv@gmail.com" style={{ color: '#818cf8' }}>jsolution.sv@gmail.com</a>
          </div>
          <div>
            ¿Ya tienes una clave?{' '}
            <a
              href="https://chromewebstore.google.com"
              target="_blank" rel="noreferrer"
              style={{ color: '#818cf8' }}
            >
              Instala la extensión →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
