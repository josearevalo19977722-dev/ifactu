import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Lee el ambiente MH desde la empresa.
 * Prioridad: empresa.mhAmbiente → variable de entorno MH_AMBIENTE → '00' (pruebas).
 */
export function getAmbiente(
  empresa: { mhAmbiente?: string } | null | undefined,
  config: ConfigService,
): string {
  return empresa?.mhAmbiente || config.get<string>('MH_AMBIENTE', '00');
}

/**
 * Detecta si MODO_DEMO está activo de forma case-insensitive.
 * Acepta: 'true', 'True', 'TRUE', '1', 'yes', 'YES'.
 */
export function isModoDemo(config: ConfigService): boolean {
  const val = config.get<string>('MODO_DEMO', 'false').toLowerCase().trim();
  return val === 'true' || val === '1' || val === 'yes';
}

/**
 * Devuelve el NIT limpio (sin guiones) de la empresa.
 * Lanza BadRequestException si la empresa no tiene NIT configurado.
 */
export function getNitEmisor(empresa: { nit?: string } | null | undefined): string {
  const nit = empresa?.nit?.replace(/-/g, '');
  if (!nit) throw new BadRequestException('La empresa no tiene NIT configurado');
  return nit;
}
