export interface TipoEstablecimiento {
  codigo: string;
  descripcion: string;
}

export const CATALOG_META_TIPO_ESTABLECIMIENTO = {
  fuente: 'Ministerio de Hacienda SV - Catalogo Sistema de Transmision',
  version: '1.2 (10/2025)',
  catalogo: 'CAT-009',
  actualizado: '2026-04-20',
} as const;

export const TIPOS_ESTABLECIMIENTO: TipoEstablecimiento[] = [
  { codigo: '01', descripcion: 'Sucursal' },
  { codigo: '02', descripcion: 'Casa Matriz' },
  { codigo: '04', descripcion: 'Bodega' },
  { codigo: '07', descripcion: 'Patio' },
];
