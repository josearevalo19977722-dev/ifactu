import apiClient from '../api/apiClient';
import { useToast } from '../context/ToastContext';
import type { DatosClienteNuevo } from '../hooks/useGuardarCliente';

interface Props {
  datos: DatosClienteNuevo;
  onClose: () => void;
  onGuardado: () => void;
}

export function GuardarClienteModal({ datos, onClose, onGuardado }: Props) {
  const toast = useToast();

  const guardar = async () => {
    try {
      await apiClient.post('/contactos', {
        nombre:               datos.nombre,
        nit:                  datos.nit              ?? null,
        nrc:                  datos.nrc              ?? null,
        numDocumento:         datos.numDocumento     ?? datos.nit ?? null,
        tipoDocumento:        datos.tipoDocumento    ?? (datos.nit ? '36' : null),
        correo:               datos.correo           ?? null,
        telefono:             datos.telefono         ?? null,
        codActividad:         datos.codActividad     ?? null,
        descActividad:        datos.descActividad    ?? null,
        direccionDepartamento:datos.direccionDepartamento ?? null,
        direccionMunicipio:   datos.direccionMunicipio   ?? null,
        direccionComplemento: datos.direccionComplemento ?? null,
      });
      toast.success('Cliente guardado', `${datos.nombre} agregado al catálogo`);
      onGuardado();
    } catch {
      toast.error('Error', 'No se pudo guardar el cliente');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">💾 ¿Guardar cliente?</h3>
        </div>
        <div className="modal-body" style={{ fontSize: '.9rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
          <p>
            <strong style={{ color: 'var(--text)' }}>{datos.nombre}</strong> no existe en tu
            catálogo de clientes.
          </p>
          <p>¿Deseas guardarlo para seleccionarlo rápidamente en el futuro?</p>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            No, gracias
          </button>
          <button className="btn btn-primary btn-sm" onClick={guardar}>
            Sí, guardar
          </button>
        </div>
      </div>
    </div>
  );
}
