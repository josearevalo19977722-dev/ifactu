import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Lee el ambiente MH desde la empresa.
 * Prioridad: empresa.mhAmbiente → variable de entorno MH_AMBIENTE → '00' (pruebas).
 * '00' = Pruebas/Sandbox, '01' = Producción
 */
export function getAmbiente(
  empresa: { mhAmbiente?: string } | null | undefined,
  config: ConfigService,
): string {
  return empresa?.mhAmbiente || config.get<string>('MH_AMBIENTE', '00');
}

/**
 * URLs del MH según el ambiente de la empresa.
 * Si la empresa tiene mhAmbiente='01' usa producción, de lo contrario pruebas.
 * Esto permite que distintos tenants apunten a ambientes distintos.
 */
export interface MhUrls {
  auth: string;
  recepcion: string;
  consulta: string;
  lote: string;
  loteConsulta: string;
  anular: string;
  contingencia: string;
}

export function getMhUrls(
  empresa: { mhAmbiente?: string } | null | undefined,
  config: ConfigService,
): MhUrls {
  const ambiente = getAmbiente(empresa, config);
  const base = ambiente === '01'
    ? 'https://api.dtes.mh.gob.sv'
    : 'https://apitest.dtes.mh.gob.sv';
  return {
    auth:         `${base}/seguridad/auth`,
    recepcion:    `${base}/fesv/recepciondte`,
    consulta:     `${base}/fesv/recepcion/consultadte`,
    lote:         `${base}/fesv/recepcionlote`,
    loteConsulta: `${base}/fesv/recepcion/consultalote`,
    anular:       `${base}/fesv/anulardte`,
    contingencia: `${base}/fesv/contingencia`,
  };
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
