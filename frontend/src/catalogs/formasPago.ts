export interface FormaPago {
  codigo: string;
  descripcion: string;
}

export const CATALOG_META_FORMA_PAGO = {
  fuente: 'Ministerio de Hacienda SV - Catalogo Sistema de Transmision',
  version: '1.2 (10/2025)',
  catalogo: 'CAT-017',
  actualizado: '2026-04-20',
} as const;

export const FORMAS_PAGO: FormaPago[] = [
  { codigo: '01', descripcion: 'Billetes y monedas' },
  { codigo: '02', descripcion: 'Tarjeta Debito' },
  { codigo: '03', descripcion: 'Tarjeta Credito' },
  { codigo: '04', descripcion: 'Cheque' },
  { codigo: '05', descripcion: 'Transferencia-Deposito Bancario' },
  { codigo: '08', descripcion: 'Dinero electronico' },
  { codigo: '09', descripcion: 'Monedero electronico' },
  { codigo: '11', descripcion: 'Bitcoin' },
  { codigo: '12', descripcion: 'Otras Criptomonedas' },
  { codigo: '13', descripcion: 'Cuentas por pagar del receptor' },
  { codigo: '14', descripcion: 'Giro bancario' },
  { codigo: '99', descripcion: 'Otros' },
];
