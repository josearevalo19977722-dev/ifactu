import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

interface WaEstado {
  estado: 'DESCONECTADO' | 'CONECTANDO' | 'QR_PENDIENTE' | 'CONECTADO';
  numero: string | null;
  qr:     string | null;
}

const ESTADO_LABELS: Record<WaEstado['estado'], { label: string; color: string; icon: string }> = {
  DESCONECTADO: { label: 'Desconectado',            color: 'var(--danger)',  icon: '🔴' },
  CONECTANDO:   { label: 'Iniciando…',              color: 'var(--warning)', icon: '🟡' },
  QR_PENDIENTE: { label: 'Esperando escaneo de QR', color: 'var(--warning)', icon: '📱' },
  CONECTADO:    { label: 'Conectado',               color: 'var(--success)', icon: '🟢' },
};

export function WhatsappSetup() {
  const queryClient = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const { data, isLoading } = useQuery<WaEstado>({
    queryKey: ['whatsapp-estado'],
    queryFn:  () => apiClient.get('/whatsapp/estado').then(r => r.data),
    // Mientras está en QR_PENDIENTE o CONECTANDO, refrescar cada 3 s
    refetchInterval: (query) => {
      const est = query.state.data?.estado;
      return est === 'CONECTADO' ? 15_000 : 3_000;
    },
  });

  // Cuando pasa a CONECTADO, mostrar mensaje
  useEffect(() => {
    if (data?.estado === 'CONECTADO') {
      setMensaje(`✅ WhatsApp conectado — número: +${data.numero}`);
    }
  }, [data?.estado]);

  const desconectarMutation = useMutation({
    mutationFn: () => apiClient.post('/whatsapp/desconectar').then(r => r.data),
    onSuccess: () => {
      setMensaje('Sesión cerrada. Recarga para conectar con otro número.');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-estado'] });
    },
  });

  const info = data ? ESTADO_LABELS[data.estado] : null;

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">WhatsApp — Configuración</span>
      </div>

      <div className="page" style={{ maxWidth: 640 }}>

        {/* Estado actual */}
        <div className="detail-card" style={{ marginBottom: 24 }}>
          <div className="detail-card-header">Estado de conexión</div>
          <div className="detail-card-body">
            {isLoading ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{info?.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, color: info?.color, fontSize: '1.05rem' }}>
                    {info?.label}
                  </div>
                  {data?.numero && (
                    <div style={{ fontSize: '.875rem', color: 'var(--text-2)', marginTop: 2 }}>
                      Número: <strong>+{data.numero}</strong>
                    </div>
                  )}
                </div>
                {data?.estado === 'CONECTADO' && (
                  <button
                    className="btn btn-sm btn-danger"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => desconectarMutation.mutate()}
                    disabled={desconectarMutation.isPending}
                  >
                    {desconectarMutation.isPending ? 'Cerrando…' : '🔌 Cerrar sesión'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mensaje de feedback */}
        {mensaje && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            {mensaje}
          </div>
        )}

        {/* QR para escanear */}
        {data?.estado === 'QR_PENDIENTE' && data.qr && (
          <div className="detail-card" style={{ marginBottom: 24, borderLeft: '4px solid var(--warning)' }}>
            <div className="detail-card-header">📱 Escanea el código QR</div>
            <div className="detail-card-body" style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-2)', fontSize: '.875rem', marginBottom: 16 }}>
                Abre WhatsApp en tu teléfono → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong> y escanea este código.
              </p>
              <div style={{
                display:        'inline-block',
                padding:        12,
                background:     'white',
                borderRadius:   12,
                border:         '2px solid var(--border)',
                boxShadow:      '0 4px 20px rgba(0,0,0,.08)',
              }}>
                <img
                  src={data.qr}
                  alt="QR WhatsApp"
                  style={{ width: 260, height: 260, display: 'block' }}
                />
              </div>
              <p style={{ color: 'var(--text-3)', fontSize: '.8rem', marginTop: 12 }}>
                El código se actualiza cada 20 segundos. Esta página se refresca automáticamente.
              </p>
            </div>
          </div>
        )}

        {/* Esperando que el cliente inicie */}
        {(data?.estado === 'CONECTANDO' || data?.estado === 'DESCONECTADO') && (
          <div className="detail-card" style={{ borderLeft: '4px solid var(--info, #3b82f6)' }}>
            <div className="detail-card-header">ℹ️ Iniciando cliente WhatsApp</div>
            <div className="detail-card-body">
              <p style={{ fontSize: '.875rem', color: 'var(--text-2)' }}>
                El sistema está iniciando el cliente WhatsApp. En unos segundos aparecerá el QR para escanear.
                Esta página se actualiza automáticamente.
              </p>
              <div style={{ marginTop: 12 }}>
                <div className="spinner" />
              </div>
            </div>
          </div>
        )}

        {/* Instrucciones */}
        {data?.estado === 'CONECTADO' && (
          <div className="detail-card">
            <div className="detail-card-header">✅ Todo listo</div>
            <div className="detail-card-body">
              <p style={{ fontSize: '.875rem', color: 'var(--text-2)' }}>
                Todos los DTEs emitidos con éxito serán enviados automáticamente al WhatsApp del receptor
                (si proporcionaron número) <strong>15 segundos después de la emisión</strong>, con el PDF adjunto.
              </p>
              <ul style={{ fontSize: '.875rem', color: 'var(--text-2)', marginTop: 8, paddingLeft: 18 }}>
                <li>📱 <strong>WhatsApp:</strong> 15 s después — con PDF adjunto</li>
                <li>📧 <strong>Email:</strong> 20 s después — con PDF adjunto</li>
                <li>⏱ Los mensajes se envían en cola (1 cada 15 s) para no saturar el número</li>
                <li>Si el receptor no dejó correo o teléfono, no se envía nada</li>
              </ul>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
