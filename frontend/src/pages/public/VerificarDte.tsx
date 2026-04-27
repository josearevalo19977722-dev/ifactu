import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE } from '../../api/apiClient';

interface DtePublico {
  codigoGeneracion: string;
  numeroControl: string;
  tipoDte: string;
  tipoNombre: string;
  fechaEmision: string;
  estado: string;
  selloRecepcion: string | null;
  totalPagar: number;
  emisor: { nombre: string; nit: string; nrc: string };
  receptor: { nombre: string | null; nit: string | null };
}

const esSelliReal = (sello: string | null) =>
  !!sello && !sello.startsWith('DEMO-') && !sello.startsWith('DEMO_');

const fmtFecha = (f: string) => {
  if (!f) return '—';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
};

export function VerificarDte() {
  const { codigoGeneracion } = useParams<{ codigoGeneracion: string }>();

  const { data: dte, isLoading, error } = useQuery<DtePublico>({
    queryKey: ['verificar-dte', codigoGeneracion],
    queryFn: () =>
      axios.get(`${API_BASE}/public/dte/${codigoGeneracion}`).then(r => r.data),
    retry: false,
    enabled: !!codigoGeneracion,
  });

  const verificadoMH = dte && esSelliReal(dte.selloRecepcion) && dte.estado === 'RECIBIDO';
  const anulado      = dte?.estado === 'ANULADO';

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Inter', system-ui, sans-serif", color: '#1e293b' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:none } }
        .fade-up { animation: fadeUp .4s ease both }
        .row-item:last-child { border-bottom: none !important }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', padding: '40px 20px 56px' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
          <img src="/ifactu-logo.png" alt="iFactu" style={{ height: 120, objectFit: 'contain', marginBottom: 14, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,.65)', letterSpacing: .4 }}>
            Verificación de Documento Tributario Electrónico · El Salvador
          </p>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 620, margin: '-28px auto 60px', padding: '0 16px' }}>

        {/* Loading */}
        {isLoading && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '60px 20px', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.07)' }}>
            <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Verificando documento…</p>
          </div>
        )}

        {/* Not found */}
        {!isLoading && (error || !dte) && (
          <div className="fade-up" style={{ background: '#fff', borderRadius: 16, padding: '52px 28px', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.07)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔍</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>Documento no encontrado</h2>
            <p style={{ color: '#64748b', fontSize: 14, maxWidth: 340, margin: '0 auto 20px', lineHeight: 1.6 }}>
              No encontramos un DTE con este código. Verifique que el enlace esté completo.
            </p>
            <code style={{ display: 'inline-block', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 14px', borderRadius: 8, fontSize: 11, color: '#64748b', wordBreak: 'break-all' }}>
              {codigoGeneracion}
            </code>
          </div>
        )}

        {/* DTE found */}
        {!isLoading && dte && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Estado banner */}
            <div style={{
              borderRadius: 16, padding: '22px 24px',
              display: 'flex', alignItems: 'flex-start', gap: 18,
              boxShadow: '0 4px 24px rgba(0,0,0,.07)',
              background: verificadoMH ? '#f0fdf4' : anulado ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${verificadoMH ? '#bbf7d0' : anulado ? '#fecaca' : '#fde68a'}`,
            }}>
              <div style={{ fontSize: 42, lineHeight: 1, flexShrink: 0 }}>
                {verificadoMH ? '✅' : anulado ? '❌' : '⏳'}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: verificadoMH ? '#14532d' : anulado ? '#7f1d1d' : '#78350f', marginBottom: 4 }}>
                  {verificadoMH
                    ? 'Documento verificado por el Ministerio de Hacienda'
                    : anulado
                    ? 'Documento anulado — sin validez fiscal'
                    : 'Documento en procesamiento'}
                </div>
                <div style={{ fontSize: 13, color: verificadoMH ? '#16a34a' : anulado ? '#dc2626' : '#d97706', lineHeight: 1.5 }}>
                  {verificadoMH
                    ? 'Este DTE fue recibido y sellado oficialmente por el MH de El Salvador.'
                    : anulado
                    ? 'Este DTE ha sido invalidado y no tiene efecto tributario.'
                    : 'Este DTE aún no ha sido confirmado por el Ministerio de Hacienda.'}
                </div>
                {verificadoMH && dte.selloRecepcion && (
                  <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 11, color: '#166534', background: '#dcfce7', display: 'inline-block', padding: '3px 10px', borderRadius: 6, wordBreak: 'break-all' }}>
                    Sello: {dte.selloRecepcion}
                  </div>
                )}
              </div>
            </div>

            {/* Detalle card */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.07)', overflow: 'hidden' }}>

              {/* Card header */}
              <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', padding: '20px 24px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
                  Documento Tributario Electrónico
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{dte.tipoNombre}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>
                  {dte.tipoDte === '01' ? 'Factura CF' : dte.tipoDte === '03' ? 'CCF' : `Tipo ${dte.tipoDte}`} · {fmtFecha(dte.fechaEmision)}
                </div>
              </div>

              {/* Total highlight */}
              <div style={{ background: '#eff6ff', borderBottom: '1px solid #dbeafe', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>Total a Pagar</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: '#1e3a8a' }}>
                  ${Number(dte.totalPagar).toFixed(2)}
                </span>
              </div>

              {/* Rows */}
              <div style={{ padding: '0 24px' }}>
                {([
                  ['N° Control',       dte.numeroControl,      true],
                  ['Emisor',           `${dte.emisor.nombre}`, false],
                  ['NIT Emisor',       dte.emisor.nit,         false],
                  ['Receptor',         dte.receptor.nombre ?? 'Consumidor Final', false],
                  ...(dte.receptor.nit ? [['NIT Receptor', dte.receptor.nit, false] as [string,string,boolean]] : []),
                  ['Código generación', dte.codigoGeneracion,  true],
                ] as [string, string, boolean][]).map(([label, value, mono]) => (
                  <div key={label} className="row-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '13px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', flexShrink: 0, width: 140 }}>{label}</span>
                    <span style={{ fontSize: mono ? 11 : 13, fontFamily: mono ? 'monospace' : 'inherit', color: '#0f172a', textAlign: 'right', wordBreak: 'break-all' }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Hacienda link */}
              <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
                <a
                  href={`https://admin.factura.gob.sv/consultaPublica?fechaEmi=${dte.fechaEmision}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  🏛️ Consultar en el portal del Ministerio de Hacienda →
                </a>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '20px', fontSize: 12, color: '#94a3b8' }}>
        Verificado en <strong style={{ color: '#2563eb' }}>iFactu</strong> · Sistema de Facturación Electrónica DTE El Salvador
      </footer>
    </div>
  );
}
