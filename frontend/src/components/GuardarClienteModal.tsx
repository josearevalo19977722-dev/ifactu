import { useEffect, useState } from 'react';
import apiClient from '../api/apiClient';
import { useToast } from '../context/ToastContext';
import type { DatosClienteNuevo } from '../hooks/useGuardarCliente';

interface Props {
  datos: DatosClienteNuevo;
  onClose: () => void;
  onGuardado: () => void;
}

interface ContactoExistente {
  id: string;
  nombre: string;
  nit?: string;
  numDocumento?: string;
}

export function GuardarClienteModal({ datos, onClose, onGuardado }: Props) {
  const toast = useToast();
  const [cargando, setCargando] = useState(true);
  const [existente, setExistente] = useState<ContactoExistente | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Al abrir, buscar si ya existe un contacto con el mismo NIT/documento
  useEffect(() => {
    const nit = datos.nit || datos.numDocumento;
    if (!nit) { setCargando(false); return; }

    apiClient.get('/contactos/buscar', { params: { q: nit } })
      .then(res => {
        const lista: ContactoExistente[] = Array.isArray(res.data) ? res.data : [];
        const encontrado = lista.find(c =>
          (c.nit && c.nit === nit) ||
          (c.numDocumento && c.numDocumento === nit)
        );
        setExistente(encontrado ?? null);
      })
      .catch(() => setExistente(null))
      .finally(() => setCargando(false));
  }, [datos.nit, datos.numDocumento]);

  const payload = {
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
  };

  const guardarNuevo = async () => {
    setGuardando(true);
    try {
      await apiClient.post('/contactos', payload);
      toast.success('Cliente guardado', `${datos.nombre} agregado al catálogo`);
      onGuardado();
    } catch {
      toast.error('Error', 'No se pudo guardar el cliente');
      onClose();
    } finally { setGuardando(false); }
  };

  const actualizar = async () => {
    if (!existente) return;
    setGuardando(true);
    try {
      await apiClient.patch(`/contactos/${existente.id}`, payload);
      toast.success('Cliente actualizado', `${datos.nombre} actualizado en el catálogo`);
      onGuardado();
    } catch {
      toast.error('Error', 'No se pudo actualizar el cliente');
      onClose();
    } finally { setGuardando(false); }
  };

  if (cargando) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {existente ? '🔄 Cliente existente' : '💾 ¿Guardar cliente?'}
          </h3>
        </div>

        <div className="modal-body" style={{ fontSize: '.9rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
          {existente ? (
            <>
              <p>
                El NIT <strong style={{ color: 'var(--text)' }}>{datos.nit || datos.numDocumento}</strong> ya
                existe en tu catálogo como:
              </p>
              <div style={{
                background: 'var(--bg-subtle)', borderRadius: 6, padding: '8px 12px',
                margin: '8px 0 12px', border: '1px solid var(--border)',
              }}>
                <strong style={{ color: 'var(--text)' }}>{existente.nombre}</strong>
              </div>
              <p>
                El DTE usa el nombre <strong style={{ color: 'var(--text)' }}>{datos.nombre}</strong>.
                ¿Qué deseas hacer?
              </p>
            </>
          ) : (
            <>
              <p>
                <strong style={{ color: 'var(--text)' }}>{datos.nombre}</strong> no existe en tu
                catálogo de clientes.
              </p>
              <p>¿Deseas guardarlo para seleccionarlo rápidamente en el futuro?</p>
            </>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={guardando}>
            No, gracias
          </button>
          {existente ? (
            <>
              <button className="btn btn-sm" onClick={guardarNuevo} disabled={guardando}
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                Guardar como nuevo
              </button>
              <button className="btn btn-primary btn-sm" onClick={actualizar} disabled={guardando}>
                {guardando ? 'Actualizando...' : 'Actualizar existente'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={guardarNuevo} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Sí, guardar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
