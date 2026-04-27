/** Códigos tipo DTE (MH) + etiqueta corta para UI admin */
export const OPCIONES_TIPO_DTE: { codigo: string; label: string }[] = [
  { codigo: '01', label: 'Factura CF' },
  { codigo: '03', label: 'Crédito fiscal (CCF)' },
  { codigo: '04', label: 'Nota remisión (NRE)' },
  { codigo: '05', label: 'Nota crédito (NC)' },
  { codigo: '06', label: 'Nota débito (ND)' },
  { codigo: '07', label: 'Comprobante retención' },
  { codigo: '11', label: 'Factura exportación (FEXE)' },
  { codigo: '14', label: 'Factura sujeto excluido (FSE)' },
  { codigo: '15', label: 'Comprobante donación' },
];

export const CODIGOS_TIPO_DTE_TODOS = OPCIONES_TIPO_DTE.map(o => o.codigo);

/** null / undefined / [] → sin restricción (compat); si hay lista, debe incluir el código */
export function empresaPermiteTipoDte(
  tipos: string[] | null | undefined,
  codigo: string,
): boolean {
  if (!tipos || tipos.length === 0) return true;
  return tipos.includes(codigo);
}
