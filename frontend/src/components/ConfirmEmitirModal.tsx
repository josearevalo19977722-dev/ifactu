interface Props {
  titulo: string;
  receptor: string;
  total: number;
  nItems: number;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}


export function ConfirmEmitirModal({ titulo, receptor, total, nItems, loading, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ width: 'min(480px, calc(100vw - 32px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">Confirmar emisión</span>
          <button className="modal-close" onClick={onCancel} type="button">×</button>
        </div>

        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {/* Icono y mensaje principal */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-1)' }}>
              ¿Emitir {titulo}?
            </p>
          </div>

          {/* Resumen del DTE */}
          <div style={{
            background: 'var(--bg-subtle)',
            borderRadius: 10,
            padding: '14px 18px',
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.875rem' }}>
              <span style={{ color: 'var(--text-3)' }}>Receptor</span>
              <span style={{ fontWeight: 500, color: 'var(--text-1)', maxWidth: 220, textAlign: 'right' }}>{receptor || 'CONSUMIDOR FINAL'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.875rem' }}>
              <span style={{ color: 'var(--text-3)' }}>Ítems</span>
              <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>{nItems}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>Total</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)' }}>${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Advertencia */}
          <div style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '.8rem',
            color: '#92400e',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>Una vez emitido, el DTE será enviado a Hacienda y <strong>no podrá modificarse</strong>. Si necesita anularlo, podrá hacerlo desde <strong>DTEs Transmitidos</strong>.</span>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-sm" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Emitiendo...' : `✅ Confirmar y emitir`}
          </button>
        </div>
      </div>
    </div>
  );
}
