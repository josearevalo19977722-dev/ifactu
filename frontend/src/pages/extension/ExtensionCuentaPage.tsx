import { useState } from 'react';
import { sileo } from 'sileo';
import apiClient from '../../api/apiClient';

interface CuentaLicencia {
  plan: string;
  planNombre: string;
  nombre: string | null;
  activa: boolean;
  maxDtesMes: number | null;
  dtesUsadosMes: number;
  expiresAt: string | null;
  maxCuentasCorreo: number | null;
  incluyeF07: boolean;
  incluyeExcel: boolean;
  updates: boolean;
}

interface CuentaPago {
  fecha: string;
  plan: string | null;
  monto: number | null;
  orderCode: string;
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 16,
  padding: 24,
};

export function ExtensionCuentaPage() {
  const [clave, setClave] = useState('');
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [licencia, setLicencia] = useState<CuentaLicencia | null>(null);
  const [pagos, setPagos] = useState<CuentaPago[]>([]);

  const consultar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cargando) return;
    setCargando(true);
    try {
      const { data } = await apiClient.post('/extension/mi-cuenta', {
        clave: clave.trim(),
        email: email.trim(),
      });
      if (!data.ok) {
        sileo.error({ title: 'No se pudo consultar', description: data.error });
        setLicencia(null);
        setPagos([]);
      } else {
        setLicencia(data.licencia);
        setPagos(data.pagos ?? []);
      }
    } catch {
      sileo.error({ title: 'Error de conexión', description: 'Intenta de nuevo en unos minutos.' });
    } finally {
      setCargando(false);
    }
  };

  const pct = licencia?.maxDtesMes
    ? Math.min(100, Math.round((licencia.dtesUsadosMes / licencia.maxDtesMes) * 100))
    : 0;
  const vencida = licencia?.expiresAt ? new Date(licencia.expiresAt) < new Date() : false;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '0 20px 80px',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', padding: 'clamp(36px, 8vw, 64px) 0 32px' }}>
          <img
            src="/ifactu-logo.png?v=4"
            alt="iFactu"
            style={{
              height: 80, objectFit: 'contain', display: 'block',
              margin: '0 auto 18px',
              filter: 'drop-shadow(0 0 24px rgba(99,102,241,.35))',
            }}
          />
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            background: 'linear-gradient(90deg, rgba(99,102,241,.22), rgba(168,85,247,.18))',
            border: '1px solid rgba(129,140,248,.5)',
            boxShadow: '0 0 28px rgba(99,102,241,.28), inset 0 1px 0 rgba(255,255,255,.10)',
            borderRadius: 99, padding: '8px 18px', marginBottom: 20,
          }}>
            <svg width="17" height="17" viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r="50" fill="#fff" />
              <path d="M50 50 L6.7 25 A50 50 0 0 1 93.3 25 Z" fill="#EA4335" />
              <path d="M50 50 L50 100 A50 50 0 0 1 6.7 25 Z" fill="#34A853" />
              <path d="M50 50 L93.3 25 A50 50 0 0 1 50 100 Z" fill="#FBBC05" />
              <circle cx="50" cy="50" r="24" fill="#fff" />
              <circle cx="50" cy="50" r="19" fill="#4285F4" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: .3, color: '#c7d2fe' }}>iFactu_Conta</span>
          </div>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, margin: '0 0 10px' }}>Mi licencia</h1>
          <p style={{ fontSize: 15, color: '#94a3b8', margin: 0 }}>
            Consulta tu plan, uso del mes e historial de pagos.
          </p>
        </div>

        {/* ── Formulario ── */}
        <form onSubmit={consultar} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#94a3b8' }}>Clave de licencia</label>
            <input
              value={clave}
              onChange={e => setClave(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(99,102,241,.4)',
                background: 'rgba(255,255,255,.12)', color: '#f8fafc', fontSize: 14,
                fontFamily: 'monospace', letterSpacing: 2, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#94a3b8' }}>Correo de la compra</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tucorreo@empresa.com"
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(99,102,241,.4)',
                background: 'rgba(255,255,255,.12)', color: '#f8fafc', fontSize: 14, outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={cargando || !clave.trim() || !email.trim()}
            style={{
              padding: '12px 0', borderRadius: 12, border: 'none', cursor: cargando ? 'wait' : 'pointer',
              fontSize: 14, fontWeight: 700, color: '#fff',
              background: 'linear-gradient(90deg, #6366f1, #a855f7)',
              opacity: cargando || !clave.trim() || !email.trim() ? 0.6 : 1,
            }}
          >
            {cargando ? 'Consultando…' : 'Consultar mi licencia'}
          </button>
        </form>

        {/* ── Resultado ── */}
        {licencia && (
          <>
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5 }}>Plan actual</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#a5b4fc' }}>{licencia.planNombre}</div>
                  {licencia.nombre && <div style={{ fontSize: 13, color: '#94a3b8' }}>{licencia.nombre}</div>}
                </div>
                <span style={{
                  padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                  background: !licencia.activa || vencida ? 'rgba(239,68,68,.15)' : 'rgba(16,185,129,.15)',
                  color: !licencia.activa || vencida ? '#f87171' : '#34d399',
                  border: `1px solid ${!licencia.activa || vencida ? 'rgba(239,68,68,.4)' : 'rgba(16,185,129,.4)'}`,
                }}>
                  {!licencia.activa ? 'Revocada' : vencida ? 'Vencida' : 'Activa'}
                </span>
              </div>

              {/* Uso del mes */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: '#94a3b8' }}>DTEs este mes</span>
                  <span style={{ fontWeight: 700, color: licencia.maxDtesMes && pct >= 90 ? '#f87171' : '#cbd5e1' }}>
                    {licencia.dtesUsadosMes}{licencia.maxDtesMes ? ` / ${licencia.maxDtesMes}` : ' · Ilimitado'}
                  </span>
                </div>
                {licencia.maxDtesMes != null && (
                  <div style={{ height: 8, borderRadius: 99, background: 'rgba(148,163,184,.2)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99, width: `${pct}%`,
                      background: pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'linear-gradient(90deg, #6366f1, #a855f7)',
                    }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, fontSize: 13, color: '#cbd5e1' }}>
                <div>📧 {licencia.maxCuentasCorreo == null ? 'Cuentas ilimitadas' : `${licencia.maxCuentasCorreo} cuenta${licencia.maxCuentasCorreo > 1 ? 's' : ''} de correo`}</div>
                <div style={{ color: licencia.incluyeF07 ? '#86efac' : '#475569' }}>{licencia.incluyeF07 ? '✅' : '✖️'} Anexo F-07</div>
                <div style={{ color: licencia.incluyeExcel ? '#86efac' : '#475569' }}>{licencia.incluyeExcel ? '✅' : '✖️'} Excel</div>
                <div style={{ color: licencia.updates ? '#86efac' : '#475569' }}>
                  {licencia.updates ? '✅' : '✖️'} Actualizaciones de por vida
                </div>
                <div>
                  📅 {licencia.expiresAt
                    ? `Vence: ${new Date(licencia.expiresAt).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'Sin vencimiento'}
                </div>
              </div>

              {!licencia.updates && licencia.activa && !vencida && (
                <a href="/extension#updates" style={{
                  display: 'block', textAlign: 'center', marginTop: 18, padding: '10px 0',
                  borderRadius: 12, fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  color: '#6ee7b7', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.35)',
                }}>
                  🔄 Agregar actualizaciones de por vida →
                </a>
              )}

              {(vencida || !licencia.activa) && (
                <a href="/extension" style={{
                  display: 'block', textAlign: 'center', marginTop: 18, padding: '11px 0',
                  borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none',
                  background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                }}>
                  Renovar mi plan →
                </a>
              )}
            </div>

            {/* Historial de pagos */}
            <div style={card}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Historial de pagos</div>
              {pagos.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Sin pagos registrados (las compras anteriores a junio 2026 pueden no aparecer).
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Fecha</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Plan</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Monto</th>
                      <th style={{ padding: '6px 8px', fontWeight: 600 }}>Orden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map(p => (
                      <tr key={p.orderCode} style={{ borderTop: '1px solid rgba(255,255,255,.06)', color: '#cbd5e1' }}>
                        <td style={{ padding: '8px' }}>
                          {new Date(p.fecha).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '8px', textTransform: 'capitalize' }}>{p.plan ?? '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{p.monto != null ? `$${p.monto.toFixed(2)}` : '—'}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{p.orderCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 32, fontSize: 13, color: '#64748b' }}>
          ¿No encuentras tu clave? Escríbenos a{' '}
          <a href="mailto:jsolution.sv@gmail.com" style={{ color: '#818cf8' }}>jsolution.sv@gmail.com</a>
          <div style={{ marginTop: 8 }}>
            <a href="/extension" style={{ color: '#475569' }}>← Ver planes</a>
          </div>
        </div>
      </div>
    </div>
  );
}
