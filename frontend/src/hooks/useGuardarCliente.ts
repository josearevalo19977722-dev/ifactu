import { useState } from 'react';

export interface DatosClienteNuevo {
  nombre: string;
  nit?: string;
  nrc?: string;
  numDocumento?: string;
  tipoDocumento?: string;
  correo?: string;
  telefono?: string;
  codActividad?: string;
  descActividad?: string;
  direccionDepartamento?: string;
  direccionMunicipio?: string;
  direccionComplemento?: string;
}

/**
 * Hook para gestionar el flujo "¿Guardar cliente nuevo en catálogo?".
 *
 * Uso:
 *   const { marcarDelCatalogo, checkGuardarCliente, clienteNuevoModal, setClienteNuevoModal } = useGuardarCliente();
 *
 * 1. En onClienteSelect → llamar marcarDelCatalogo()
 * 2. En handleSubmit  → llamar checkGuardarCliente(receptor)
 * 3. Renderizar <GuardarClienteModal> con clienteNuevoModal
 */
export function useGuardarCliente() {
  const [clienteDelCatalogo, setClienteDelCatalogo] = useState(false);
  const [clienteNuevoModal, setClienteNuevoModal] = useState<DatosClienteNuevo | null>(null);

  const marcarDelCatalogo = () => setClienteDelCatalogo(true);

  /**
   * Llámalo justo antes de setPendingData().
   * Si el receptor no vino del catálogo y tiene nombre + identificador, abre el modal.
   */
  const checkGuardarCliente = (receptor: Record<string, any>) => {
    if (clienteDelCatalogo) return;
    const nombre = receptor?.nombre?.trim();
    const identificador = receptor?.nit || receptor?.numDocumento;
    if (!nombre || !identificador) return;

    setClienteNuevoModal({
      nombre,
      nit:                  receptor.nit              || undefined,
      nrc:                  receptor.nrc              || undefined,
      numDocumento:         receptor.numDocumento     || receptor.nit || undefined,
      tipoDocumento:        receptor.tipoDocumento    || (receptor.nit ? '36' : undefined),
      correo:               receptor.correo           || undefined,
      telefono:             receptor.telefono         || undefined,
      codActividad:         receptor.codActividad     || undefined,
      descActividad:        receptor.descActividad    || undefined,
      direccionDepartamento:receptor.direccionDepartamento || undefined,
      direccionMunicipio:   receptor.direccionMunicipio   || undefined,
      direccionComplemento: receptor.direccionComplemento || undefined,
    });
  };

  const marcarGuardado = () => {
    setClienteDelCatalogo(true);
    setClienteNuevoModal(null);
  };

  return {
    marcarDelCatalogo,
    checkGuardarCliente,
    clienteNuevoModal,
    setClienteNuevoModal,
    marcarGuardado,
  };
}
