import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

interface LicenciaResp {
  licencia: {
    apiKey: string;
    activa: boolean;
    createdAt: string;
  } | null;
}

export function ExtensionLicenciaPage() {
  const [copiado, setCopiado] = useState(false);

  const { data, isLoading } = useQuery<LicenciaResp>({
    queryKey: ['mi-licencia-extension'],
    queryFn: () => apiClient.get('/extension/mi-licencia').then(r => r.data),
  });

  const licencia = data?.licencia;

  const copiar = () => {
    if (!licencia?.apiKey) return;
    navigator.clipboard.writeText(licencia.apiKey).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>
          🧩 Extensión Chrome — iFactu_Conta
        </h1>
        <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>
          Descarga tus DTEs automáticamente desde Gmail y Outlook.
        </p>
      </div>

      {isLoading && (
        <div style={{ color: '#64748b', fontSize: 14 }}>Cargando licencia…</div>
      )}

      {!isLoading && !licencia && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '20px 24px', color: '#991b1b', fontSize: 14 }}>
          No se encontró una licencia activa para tu cuenta. Contacta al administrador.
        </div>
      )}

      {!isLoading && licencia && (
        <>
          {/* Tarjeta de licencia */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,.06)', overflow: 'hidden', marginBottom: 20 }}>

            <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', padding: '20px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                Tu clave de licencia
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <code style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: '#fff',
                  background: 'rgba(255,255,255,.12)',
                  padding: '9px 14px',
                  borderRadius: 8,
                  wordBreak: 'break-all',
                  minWidth: 0,
                }}>
                  {licencia.apiKey}
                </code>
                <button
                  onClick={copiar}
                  style={{
                    flexShrink: 0,
                    padding: '9px 18px',
                    background: copiado ? 'rgba(16,185,129,.9)' : 'rgba(255,255,255,.18)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,.25)',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all .2s',
                  }}
                >
                  {copiado ? '✅ Copiado' : '📋 Copiar'}
                </button>
              </div>
            </div>

            <div style={{ padding: '16px 24px', display: 'flex', gap: 24, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Estado</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: licencia.activa ? '#10b981' : '#ef4444' }}>
                  {licencia.activa ? '✅ Activa' : '❌ Revocada'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Plan</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>iFactu (incluido)</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Generada</div>
                <div style={{ fontSize: 13, color: '#334155' }}>
                  {new Date(licencia.createdAt).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 24px', background: '#f8fafc', fontSize: 12, color: '#64748b' }}>
              ⚠️ No compartas esta clave. Es personal e intransferible.
            </div>
          </div>

          {/* Instrucciones */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>
              ¿Cómo usar la extensión?
            </h3>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'Instala la extensión iFactu_Conta desde el archivo .crx o la Chrome Web Store.',
                'Haz clic en el ícono de la extensión → menú ⚙️ Configuración.',
                'En el campo "Clave de licencia", pega la clave que aparece arriba.',
                'Haz clic en "Validar y guardar" — la extensión quedará activa.',
                'Agrega tu cuenta Gmail o abre Outlook y usa el Autopilot para descargar tus DTEs.',
              ].map((paso, i) => (
                <li key={i} style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                  <strong style={{ color: '#6366f1' }}>Paso {i + 1}:</strong> {paso}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
