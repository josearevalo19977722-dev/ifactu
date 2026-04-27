/**
 * Maneja el resultado de emitir un DTE:
 * - RECIBIDO   → toast de éxito
 * - RECHAZADO  → toast de error con el motivo real de Hacienda
 * - CONTINGENCIA → toast de advertencia
 *
 * Devuelve true si fue RECIBIDO, false si fue rechazado/contingencia.
 */
export function handleDteEmitido(
  dte: any,
  toast: { success: (t: string, d?: string) => void; error: (t: string, d?: string) => void; warning?: (t: string, d?: string) => void },
  nombreDoc: string,
): boolean {
  if (dte.estado === 'RECIBIDO') {
    toast.success(`${nombreDoc} emitido`, `${dte.numeroControl} — recibido por Hacienda`);
    return true;
  }

  if (dte.estado === 'CONTINGENCIA') {
    const warn = toast.warning ?? toast.error;
    warn(
      `${nombreDoc} en contingencia`,
      `${dte.numeroControl} — Se transmitirá cuando se restaure la conexión con Hacienda`,
    );
    return false;
  }

  // RECHAZADO — mostrar motivo real de Hacienda
  const motivo = buildMotivoRechazo(dte);
  toast.error(`${nombreDoc} rechazado por Hacienda`, motivo);
  return false;
}

function buildMotivoRechazo(dte: any): string {
  const partes: string[] = [];

  if (dte.codigoMsg) {
    partes.push(`[${dte.codigoMsg}]`);
  }
  if (dte.descripcionMsg && dte.descripcionMsg !== 'RECHAZADO') {
    partes.push(dte.descripcionMsg);
  }
  if (dte.observaciones) {
    // observaciones viene como string con comas desde el backend
    const obs = dte.observaciones
      .split(/,\s*/)
      .filter(Boolean)
      .join(' · ');
    if (obs && obs !== dte.descripcionMsg) {
      partes.push(obs);
    }
  }

  return partes.length > 0
    ? partes.join(' — ')
    : 'Hacienda rechazó el documento sin especificar motivo. Revisá el detalle del DTE.';
}
