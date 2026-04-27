import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';

interface ServicioSalud {
  ok: boolean;
  detalle: string;
  ms?: number;
}

interface SaludData {
  timestamp: string;
  servicios: {
    mh: ServicioSalud;
    firmador: ServicioSalud;
    smtp: ServicioSalud;
    db: ServicioSalud;
    whatsapp: ServicioSalud;
  };
}

const SERVICIO_INFO: Record<string, { label: string; icon: string; desc: string }> = {
  mh:        { label: 'MH API',           icon: '🏛️',  desc: 'Ministerio de Hacienda — autenticación y envío DTE' },
  firmador:  { label: 'Firmador Docker',  icon: '🔐',  desc: 'Servicio de firma digital de documentos' },
  smtp:      { label: 'SMTP Email',       icon: '📧',  desc: 'Servidor de correo electrónico' },
  whatsapp:  { label: 'WhatsApp',         icon: '💬',  desc: 'Servicio de mensajería WhatsApp Web' },
  db:        { label: 'Base de datos',    icon: '🗄️',  desc: 'Conexión a PostgreSQL / base de datos principal' },
};

function ServiceCard({ name, data }: { name: string; data: ServicioSalud }) {
  const info = SERVICIO_INFO[name] ?? { label: name, icon: '⚙️', desc: '' };
  return (
    <div
      style={{
        background: 'var(--surface, #fff)',
        border: `1px solid ${data.ok ? '#bbf7d0' : '#fecaca'}`,
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: data.ok
          ? '0 1px 4px rgba(22,163,74,0.08)'
          : '0 1px 4px rgba(220,38,38,0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{info.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{info.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginTop: 1 }}>{info.desc}</div>
          </div>
        </div>
        <span style={{ fontSize: 28 }}>{data.ok ? '✅' : '❌'}</span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: data.ok ? '#166534' : '#991b1b',
          background: data.ok ? '#f0fdf4' : '#fef2f2',
          borderRadius: 6,
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{data.detalle}</span>
        {data.ms !== undefined && (
          <span style={{ color: 'var(--text-muted, #64748b)', marginLeft: 8 }}>{data.ms} ms</span>
        )}
      </div>
    </div>
  );
}

export function SaludSistema() {
  const [data, setData]         = useState<SaludData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<SaludData>('/superadmin/salud');
      setData(res.data);
      setLastCheck(new Date());
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Error al consultar salud del sistema');
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    cargar();
  }, [cargar]);

  // Auto-refresh cada 30s
  useEffect(() => {
    const id = setInterval(cargar, 30_000);
    return () => clearInterval(id);
  }, [cargar]);

  const servicios = data?.servicios ? Object.entries(data.servicios) : [];
  const problemCount = servicios.filter(([, s]) => !s.ok).length;
  const allOk = problemCount === 0 && servicios.length > 0;

  return (
    <div className="page">
      <div className="topbar topbar--superadmin">
        <div className="topbar-head">
          <span className="topbar-title">Monitor de Salud</span>
          <p className="topbar-subtitle">
            Estado en tiempo real de los servicios externos e internos del sistema.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn--superadmin-cta"
          onClick={cargar}
          disabled={loading}
        >
          {loading ? 'Verificando…' : '🔄 Actualizar'}
        </button>
      </div>

      {lastCheck && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 16 }}>
          Última verificación: {lastCheck.toLocaleTimeString('es-SV')} — se actualiza cada 30 segundos
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#991b1b',
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <div
          style={{
            background: allOk ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${allOk ? '#bbf7d0' : '#fde68a'}`,
            borderRadius: 10,
            padding: '12px 20px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            color: allOk ? '#166534' : '#92400e',
          }}
        >
          <span style={{ fontSize: 20 }}>{allOk ? '✅' : '⚠️'}</span>
          {allOk
            ? 'Todos los servicios operativos'
            : `${problemCount} servicio${problemCount > 1 ? 's' : ''} con problemas`}
        </div>
      )}

      {loading && !data ? (
        <div className="loading-wrap" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {servicios.map(([name, svc]) => (
            <ServiceCard key={name} name={name} data={svc} />
          ))}
        </div>
      )}
    </div>
  );
}
