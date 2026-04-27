import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from './Modal';
import apiClient from '../api/apiClient';

interface PaqueteExtraModalProps {
  open: boolean;
  onClose: () => void;
  usados?: number;
  limite?: number;
}

type Modo = 'una-vez' | 'permanente';

export function PaqueteExtraModal({ open, onClose, usados = 0, limite = 0 }: PaqueteExtraModalProps) {
  const { data: catalogo = [] } = useQuery<{ id: string | null; cantidad: number; precio: number; nombre: string | null }[]>({
    queryKey: ['paquetes-extras-catalogo'],
    queryFn: () => apiClient.get('/billing/paquetes-extras/catalogo').then(r => r.data),
    staleTime: 60_000,
  });

  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [modo, setModo] = useState<Modo>('una-vez');
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setSeleccionado(null);
    setModo('una-vez');
    setLoading(false);
    setExito(false);
    setError(null);
    onClose();
  }

  // Ítem del catálogo actualmente seleccionado
  const itemSeleccionado = catalogo.find(p => p.cantidad === seleccionado) ?? null;

  // Determina si el ítem seleccionado tiene link de pago configurado
  const tieneIdReal = itemSeleccionado?.id !== null && itemSeleccionado?.id !== undefined;

  async function handleSolicitar() {
    if (seleccionado === null || !itemSeleccionado) return;

    // Si el ítem no tiene ID real, no puede ir a N1CO — mostrar aviso
    if (!tieneIdReal) {
      setError('Opción no disponible para pago en línea, contacta al administrador');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.post('/billing/paquetes-extras/iniciar-pago', {
        catalogoId: itemSeleccionado.id,
        esPermanente: modo === 'permanente',
      }).then(r => r.data) as { paymentLinkUrl: string };

      // Redirigir a N1CO en nueva pestaña
      window.open(result.paymentLinkUrl, '_blank');
      setExito(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err.message ?? 'No se pudo iniciar el pago';
      if (msg === 'Esta opción no tiene link de pago configurado') {
        setError('Opción no disponible para pago en línea, contacta al administrador');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="⚠️ Has alcanzado tu límite mensual"
      maxWidth={500}
    >
      {exito ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <p style={{ color: '#10b981', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
            Redirigiendo a N1CO para el pago
          </p>
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>
            Serás redirigido a N1CO para completar el pago. Una vez confirmado, tu paquete se activará automáticamente.
          </p>
          <button
            onClick={handleClose}
            style={btnPrimaryStyle}
          >
            Cerrar
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Uso actual */}
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
            Has usado <strong style={{ color: '#f87171' }}>{usados}</strong> de{' '}
            <strong style={{ color: '#e2e8f0' }}>{limite}</strong> DTEs este mes.
            Elige un paquete adicional para continuar emitiendo documentos.
          </p>

          {/* Selector de paquetes */}
          <div>
            <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Elige un paquete adicional:
            </p>
            {catalogo.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 13 }}>Cargando opciones…</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(catalogo.length, 4)}, 1fr)`, gap: 8 }}>
                {catalogo.map(p => (
                  <button
                    key={p.id ?? p.cantidad}
                    type="button"
                    onClick={() => setSeleccionado(p.cantidad)}
                    style={{
                      padding: '12px 6px',
                      borderRadius: 8,
                      border: `2px solid ${seleccionado === p.cantidad ? '#6366f1' : '#334155'}`,
                      background: seleccionado === p.cantidad ? '#312e81' : '#0f172a',
                      color: seleccionado === p.cantidad ? '#e0e7ff' : '#94a3b8',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {p.nombre && (
                      <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {p.nombre}
                      </span>
                    )}
                    <span style={{ fontWeight: 700, fontSize: 15, color: seleccionado === p.cantidad ? '#c7d2fe' : '#e2e8f0' }}>
                      {p.cantidad}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>DTEs</span>
                    <span style={{ fontWeight: 800, fontSize: 16, color: seleccionado === p.cantidad ? '#818cf8' : '#38bdf8' }}>
                      ${Number(p.precio).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selector de modo */}
          <div>
            <p style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              ¿Cómo quieres este paquete?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={radioLabelStyle(modo === 'una-vez')}>
                <input
                  type="radio"
                  name="modo-paquete"
                  value="una-vez"
                  checked={modo === 'una-vez'}
                  onChange={() => setModo('una-vez')}
                  style={{ accentColor: '#6366f1' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>Solo esta vez</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Los DTEs se agregan solo para este mes</div>
                </div>
              </label>
              <label style={radioLabelStyle(modo === 'permanente')}>
                <input
                  type="radio"
                  name="modo-paquete"
                  value="permanente"
                  checked={modo === 'permanente'}
                  onChange={() => setModo('permanente')}
                  style={{ accentColor: '#6366f1' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>Agregar a mi plan permanentemente</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Aumenta tu límite mensual de forma definitiva</div>
                </div>
              </label>
            </div>
          </div>

          {error && (
            <div style={{ color: '#f87171', fontSize: 13, background: '#450a0a', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSolicitar}
              disabled={seleccionado === null || loading}
              style={{
                ...btnPrimaryStyle,
                flex: 2,
                opacity: seleccionado === null || loading ? 0.5 : 1,
                cursor: seleccionado === null || loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? 'Procesando...'
                : seleccionado
                  ? (tieneIdReal
                      ? `Pagar con N1CO → (${seleccionado} DTEs · $${Number(itemSeleccionado?.precio ?? 0).toFixed(2)})`
                      : `Solicitar → (${seleccionado} DTEs · $${Number(itemSeleccionado?.precio ?? 0).toFixed(2)})`)
                  : 'Selecciona un paquete'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const btnPrimaryStyle: React.CSSProperties = {
  padding: '10px 0',
  borderRadius: 8,
  border: 'none',
  background: '#6366f1',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

function radioLabelStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${active ? '#6366f1' : '#334155'}`,
    background: active ? '#1e1b4b' : '#0f172a',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}
