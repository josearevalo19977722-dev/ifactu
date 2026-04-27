export interface UnidadMedida {
  codigo: number;
  descripcion: string;
}

export const CATALOG_META_UNIDADES = {
  fuente: 'Ministerio de Hacienda SV - Catalogo Sistema de Transmision',
  version: '1.2 (10/2025)',
  catalogo: 'CAT-014',
  actualizado: '2026-04-20',
} as const;

export const UNIDADES_MEDIDA: UnidadMedida[] = [
  { codigo: 1, descripcion: 'Metro' },
  { codigo: 2, descripcion: 'Yarda' },
  { codigo: 6, descripcion: 'Milimetro' },
  { codigo: 9, descripcion: 'Kilometro cuadrado' },
  { codigo: 10, descripcion: 'Hectarea' },
  { codigo: 13, descripcion: 'Metro cuadrado' },
  { codigo: 15, descripcion: 'Vara cuadrada' },
  { codigo: 18, descripcion: 'Metro cubico' },
  { codigo: 20, descripcion: 'Barril' },
  { codigo: 22, descripcion: 'Galon' },
  { codigo: 23, descripcion: 'Litro' },
  { codigo: 24, descripcion: 'Botella' },
  { codigo: 26, descripcion: 'Mililitro' },
  { codigo: 30, descripcion: 'Tonelada' },
  { codigo: 32, descripcion: 'Quintal' },
  { codigo: 33, descripcion: 'Arroba' },
  { codigo: 34, descripcion: 'Kilogramo' },
  { codigo: 36, descripcion: 'Libra' },
  { codigo: 37, descripcion: 'Onza troy' },
  { codigo: 38, descripcion: 'Onza' },
  { codigo: 39, descripcion: 'Gramo' },
  { codigo: 40, descripcion: 'Miligramo' },
  { codigo: 42, descripcion: 'Megawatt' },
  { codigo: 43, descripcion: 'Kilowatt' },
  { codigo: 44, descripcion: 'Watt' },
  { codigo: 45, descripcion: 'Megavoltio-amperio' },
  { codigo: 46, descripcion: 'Kilovoltio-amperio' },
  { codigo: 47, descripcion: 'Voltio-amperio' },
  { codigo: 49, descripcion: 'Gigawatt-hora' },
  { codigo: 50, descripcion: 'Megawatt-hora' },
  { codigo: 51, descripcion: 'Kilowatt-hora' },
  { codigo: 52, descripcion: 'Watt-hora' },
  { codigo: 53, descripcion: 'Kilovoltio' },
  { codigo: 54, descripcion: 'Voltio' },
  { codigo: 55, descripcion: 'Millar' },
  { codigo: 56, descripcion: 'Medio millar' },
  { codigo: 57, descripcion: 'Ciento' },
  { codigo: 58, descripcion: 'Docena' },
  { codigo: 59, descripcion: 'Unidad' },
  { codigo: 99, descripcion: 'Otra' },
];
