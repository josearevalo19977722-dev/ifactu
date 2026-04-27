import { describe, expect, it } from 'vitest';
import { isAxiosError } from 'axios';
import { parseApiError } from './parseApiError';

function axiosLikeError(message: unknown): Error & { isAxiosError: true; response?: { data?: unknown } } {
  const e = new Error('request failed') as Error & { isAxiosError: true; response?: { data?: unknown } };
  e.isAxiosError = true;
  e.response = { data: { message } };
  return e;
}

describe('parseApiError', () => {
  it('returns default for empty input', () => {
    expect(parseApiError(null)).toEqual(['Error desconocido']);
    expect(parseApiError(undefined)).toEqual(['Error desconocido']);
  });

  it('uses Error.message when not Axios', () => {
    expect(parseApiError(new Error('falló'))).toEqual(['falló']);
  });

  it('reads Nest/class-validator array from Axios-shaped error', () => {
    const err = axiosLikeError(['correo inválido', 'nombre requerido']);
    expect(isAxiosError(err)).toBe(true);
    expect(parseApiError(err)).toEqual(['correo inválido', 'nombre requerido']);
  });

  it('splits MH-style comma-separated Campo messages', () => {
    const raw =
      'Campo #/dte/receptor/nombre no cumple la estructura, Campo #/dte/items/0/cantidad debe ser mayor a 0';
    expect(parseApiError(axiosLikeError(raw))).toEqual([
      'Campo #/dte/receptor/nombre no cumple la estructura',
      'Campo #/dte/items/0/cantidad debe ser mayor a 0',
    ]);
  });

  it('returns single string when no Campo split pattern', () => {
    expect(parseApiError(axiosLikeError('Token inválido'))).toEqual(['Token inválido']);
  });
});
