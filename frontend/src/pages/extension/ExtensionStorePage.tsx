import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sileo } from 'sileo';
import apiClient from '../../api/apiClient';

interface Plan {
  tipo: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  maxDtesMes: number;
  maxDispositivos: number;
  maxCuentasCorreo: number;
  incluyeF07: boolean;
  incluyeExcel: boolean;
  paymentLinkUrl: string | null;
  paymentLinkUrlConUpdates: string | null;
}

const ICONOS: Record<string, string> = {
  basico:    '📦',
  pro:       '🚀',
  ilimitado: '♾️',
  // Legacy
  monthly:    '📅',
  annual:     '🗓️',
  lifetime_1: '♾️',
  lifetime_2: '♾️',
  lifetime_5: '♾️',
};

const POPULAR = 'pro'; // plan destacado

/** IVA El Salvador — el precio configurado es neto, se muestra con IVA */
const IVA = 0.13;
const conIva = (precio: number) => Number(precio) * (1 + IVA);

const FEATURES = [
  '📥 Descarga DTEs automáticamente desde Gmail',
  '📄 Soporte para CF, CCF, NRE, FSE y más tipos de DTE',
  '🔍 Detecta y organiza adjuntos JSON + PDF en segundos',
  '🤖 Autopilot: escanea tu bandeja sin intervención manual',
  '🔒 Tus datos nunca salen de tu equipo',
  '💳 Pago único — sin suscripciones ni cobros mensuales',
];

export function ExtensionStorePage() {
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState<string | null>(null);
  // Checkbox "actualizaciones de por vida" por plan (basico/pro)
  const [conUpdates, setConUpdates] = useState<Record<string, boolean>>({});

  const { data: todosLosPlanes = [], isLoading } = useQuery<Plan[]>({
    queryKey: ['extension-planes-publicos'],
    queryFn: () => apiClient.get('/extension/planes').then(r => r.data),
  });

  // El add-on de actualizaciones viaja como pseudo-plan 'updates'
  const planes = todosLosPlanes.filter(p => p.tipo !== 'updates');
  const addon  = todosLosPlanes.find(p => p.tipo === 'updates') ?? null;

  const comprar = async (plan: Plan, incluirUpdates = false) => {
    const url0 = incluirUpdates ? plan.paymentLinkUrlConUpdates : plan.paymentLinkUrl;
    if (!url0) {
      sileo.info({ title: 'Plan no disponible aún', description: 'Contáctanos en jsolution.sv@gmail.com' });
      return;
    }
    setCargando(plan.tipo);
    let url = url0;
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
      <div style={{ textAlign: 'center', padding: 'clamp(36px, 8vw, 64px) 20px clamp(24px, 5vw, 48px)' }}>
        <img
          src="/ifactu-logo-trim.png"
          alt="iFactu"
          style={{
            height: 'clamp(64px, 9vw, 96px)', objectFit: 'contain', display: 'block',
            margin: '0 auto 24px',
            filter: 'drop-shadow(0 0 32px rgba(99,102,241,.40))',
          }}
        />
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          background: 'linear-gradient(90deg, rgba(99,102,241,.22), rgba(168,85,247,.18))',
          border: '1px solid rgba(129,140,248,.5)',
          boxShadow: '0 0 28px rgba(99,102,241,.28), inset 0 1px 0 rgba(255,255,255,.10)',
          borderRadius: 99, padding: '8px 18px', marginBottom: 24,
        }}>
          {/* Logo Chrome */}
          <svg width="17" height="17" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="50" fill="#fff" />
            <path d="M50 50 L6.7 25 A50 50 0 0 1 93.3 25 Z" fill="#EA4335" />
            <path d="M50 50 L50 100 A50 50 0 0 1 6.7 25 Z" fill="#34A853" />
            <path d="M50 50 L93.3 25 A50 50 0 0 1 50 100 Z" fill="#FBBC05" />
            <circle cx="50" cy="50" r="24" fill="#fff" />
            <circle cx="50" cy="50" r="19" fill="#4285F4" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: .3, color: '#c7d2fe' }}>
            Extensión Chrome para Contadores
          </span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, maxWidth: 700, margin: '0 auto 32px', textAlign: 'left' }}>
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
            // Checkbox de updates: aplica a planes que no lo incluyen ya
            const updatesMarcado = plan.tipo !== 'ilimitado' && !!conUpdates[plan.tipo];
            const precioTotal = updatesMarcado && addon
              ? Number(plan.precio) + Number(addon.precio)
              : Number(plan.precio);
            const linkCompra = updatesMarcado ? plan.paymentLinkUrlConUpdates : plan.paymentLinkUrl;
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
                    ${conIva(precioTotal).toFixed(2)}
                  </span>
                  <span style={{ fontSize: 13, color: '#64748b', marginLeft: 6 }}>
                    {plan.tipo === 'monthly' ? '/ mes' : plan.tipo === 'annual' ? '/ año' : 'pago único'}
                  </span>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    ${Number(precioTotal).toFixed(2)} + IVA (13%)
                    {updatesMarcado && addon && (
                      <span style={{ color: '#6ee7b7' }}> · incluye updates</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, fontSize: 13, color: '#cbd5e1' }}>
                  <div>📄 {plan.maxDtesMes === 0 ? 'DTEs ilimitados' : `${plan.maxDtesMes} DTEs/mes`}</div>
                  <div>📧 {plan.maxCuentasCorreo === 0
                    ? 'Cuentas de correo ilimitadas'
                    : `${plan.maxCuentasCorreo} cuenta${plan.maxCuentasCorreo > 1 ? 's' : ''} de correo`}</div>
                  <div style={{ color: plan.incluyeF07 ? '#86efac' : '#475569' }}>
                    {plan.incluyeF07 ? '✅' : '✖️'} Anexo F-07
                  </div>
                  <div style={{ color: plan.incluyeExcel ? '#86efac' : '#475569' }}>
                    {plan.incluyeExcel ? '✅' : '✖️'} Exportación a Excel
                  </div>
                  <div>🖥️ {plan.maxDispositivos} {plan.maxDispositivos === 1 ? 'equipo' : 'equipos'}</div>
                  {plan.tipo === 'ilimitado' ? (
                    <div style={{ color: '#86efac' }}>🔄 Actualizaciones de por vida incluidas</div>
                  ) : addon ? (
                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                      marginTop: 4, padding: '9px 11px', borderRadius: 10,
                      background: updatesMarcado ? 'rgba(16,185,129,.10)' : 'rgba(255,255,255,.04)',
                      border: `1px solid ${updatesMarcado ? 'rgba(16,185,129,.45)' : 'rgba(255,255,255,.10)'}`,
                      transition: 'background .15s, border-color .15s',
                    }}>
                      <input
                        type="checkbox"
                        checked={updatesMarcado}
                        onChange={e => setConUpdates({ ...conUpdates, [plan.tipo]: e.target.checked })}
                        style={{ marginTop: 2, accentColor: '#10b981', width: 15, height: 15, flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 12.5, lineHeight: 1.45, color: updatesMarcado ? '#6ee7b7' : '#94a3b8' }}>
                        🔄 Agregar <strong>actualizaciones de por vida</strong>{' '}
                        (+${conIva(addon.precio).toFixed(2)})
                      </span>
                    </label>
                  ) : null}
                </div>

                <button
                  disabled={cargando === plan.tipo}
                  onClick={() => comprar(plan, updatesMarcado)}
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
                  {cargando === plan.tipo ? 'Redirigiendo…' : linkCompra ? '🛒 Comprar ahora' : 'Próximamente'}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Tabla comparativa ── */}
        {planes.length > 1 && (
          <div style={{ marginTop: 56, overflowX: 'auto' }}>
            <h2 style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, marginBottom: 20 }}>
              Compara los planes
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: '#94a3b8', fontWeight: 600 }}></th>
                  {planes.map(p => (
                    <th key={p.tipo} style={{
                      textAlign: 'center', padding: '10px 14px', fontWeight: 800, fontSize: 14,
                      color: p.tipo === POPULAR ? '#a5b4fc' : '#f8fafc',
                    }}>
                      {ICONOS[p.tipo] ?? '📦'} {p.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Precio único (IVA incluido)', (p: Plan) => `$${conIva(p.precio).toFixed(2)}`],
                  ['DTEs por mes', (p: Plan) => p.maxDtesMes === 0 ? 'Ilimitados' : String(p.maxDtesMes)],
                  ['Cuentas de correo', (p: Plan) => p.maxCuentasCorreo === 0 ? 'Ilimitadas' : String(p.maxCuentasCorreo)],
                  ['Anexo F-07', (p: Plan) => p.incluyeF07 ? '✅' : '—'],
                  ['Exportación a Excel', (p: Plan) => p.incluyeExcel ? '✅' : '—'],
                  ['Equipos', (p: Plan) => String(p.maxDispositivos)],
                  ['Actualizaciones de por vida', (p: Plan) =>
                    p.tipo === 'ilimitado' ? '✅ Incluidas'
                      : addon ? `Opcional +$${conIva(addon.precio).toFixed(2)}` : '—'],
                ] as [string, (p: Plan) => string][]).map(([label, fn], i) => (
                  <tr key={label} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,.03)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1', fontWeight: 600 }}>{label}</td>
                    {planes.map(p => (
                      <td key={p.tipo} style={{
                        textAlign: 'center', padding: '10px 14px',
                        color: p.tipo === POPULAR ? '#e0e7ff' : '#94a3b8',
                        background: p.tipo === POPULAR ? 'rgba(99,102,241,.08)' : 'transparent',
                      }}>
                        {fn(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Add-on: Actualizaciones de por vida ── */}
        {addon && (
          <div id="updates" style={{
            marginTop: 56,
            background: 'linear-gradient(160deg, rgba(16,185,129,.12), rgba(6,182,212,.08))',
            border: '1px solid rgba(16,185,129,.35)',
            borderRadius: 20,
            padding: 'clamp(24px, 4vw, 36px)',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24,
          }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 99, padding: '4px 12px', marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>🔄</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6ee7b7' }}>ADD-ON · PAGO ÚNICO</span>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>Actualizaciones de por vida</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
                <div>🏛️ <strong>Cuando Hacienda cambie la normativa</strong>, tu extensión se adapta sin pagar más</div>
                <div>✨ Todas las funciones nuevas apenas salgan (nuevos tipos de DTE, mejoras del F-07…)</div>
                <div>🔁 Se paga una sola vez y queda en tu licencia: <strong>si subes de plan, no se vuelve a cobrar</strong></div>
                <div>💎 El plan Ilimitado ya las incluye gratis</div>
              </div>
            </div>
            <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 180 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 34, fontWeight: 900, color: '#6ee7b7' }}>${conIva(addon.precio).toFixed(2)}</span>
                <span style={{ fontSize: 13, color: '#64748b', marginLeft: 6 }}>una vez</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 14 }}>
                ${Number(addon.precio).toFixed(2)} + IVA (13%)
              </div>
              <button
                disabled={cargando === addon.tipo}
                onClick={() => comprar(addon)}
                style={{
                  width: '100%', padding: '12px 24px', borderRadius: 12, border: 'none',
                  cursor: cargando === addon.tipo ? 'wait' : 'pointer',
                  fontSize: 14, fontWeight: 700, color: '#052e16',
                  background: 'linear-gradient(90deg, #34d399, #22d3ee)',
                  opacity: cargando === addon.tipo ? 0.7 : 1,
                }}
              >
                {cargando === addon.tipo ? 'Redirigiendo…' : addon.paymentLinkUrl ? 'Agregar a mi licencia' : 'Próximamente'}
              </button>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, maxWidth: 200 }}>
                Usa el mismo correo de tu compra para que se active automáticamente.
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 48, color: '#64748b', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {/* Logo N1CO */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6, color: '#94a3b8' }}>
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
            <span style={{ color: '#475569' }}>· Pago único, sin suscripciones</span>
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
            {' · '}
            <a href="/extension/cuenta" style={{ color: '#818cf8' }}>
              Consulta tu licencia →
            </a>
          </div>
          <div style={{ color: '#475569' }}>
            <a href="/privacidad-extension" style={{ color: '#475569' }}>Política de Privacidad</a>
            {' · '}
            <a href="https://ifactu.jsolutionsv.com" style={{ color: '#475569' }}>ifactu.jsolutionsv.com</a>
          </div>
        </div>
      </div>
    </div>
  );
}
