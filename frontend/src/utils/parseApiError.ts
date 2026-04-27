import { isAxiosError } from 'axios';

function messageFromAxiosResponseData(data: unknown): unknown {
  if (data && typeof data === 'object' && 'message' in data) {
    return (data as { message?: unknown }).message;
  }
  return undefined;
}

/**
 * Parsea errores de Axios/NestJS/MH y devuelve un array de strings legibles.
 * Maneja: string simple, array de strings (class-validator), strings separados por coma (MH).
 */
export function parseApiError(error: unknown): string[] {
  if (!error) return ['Error desconocido'];

  const axiosMsg = isAxiosError(error)
    ? messageFromAxiosResponseData(error.response?.data)
    : undefined;
  const fallbackMsg = error instanceof Error ? error.message : 'Error desconocido';
  const raw = axiosMsg ?? fallbackMsg;

  if (Array.isArray(raw)) return raw.filter(Boolean);

  if (typeof raw === 'string') {
    // MH devuelve errores como "Campo X en #, Campo Y en #, ..."
    if (raw.includes(', Campo ') || raw.includes(',Campo ')) {
      return raw.split(/,\s*(?=Campo )/).filter(Boolean);
    }
    return [raw];
  }

  return [String(raw)];
}
