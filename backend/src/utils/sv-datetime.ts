/**
 * El Salvador no observa horario de verano y está fijo en UTC-6.
 * new Date().toISOString() devuelve UTC, lo cual puede retornar
 * una fecha incorrecta cerca de la medianoche (ej. las 23:00 SV = 05:00 UTC del día siguiente).
 */
export function svDateTime(): { fecEmi: string; horEmi: string } {
  const now = new Date();
  // UTC-6 fijo (sin DST)
  const SV_OFFSET_MS = -6 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + SV_OFFSET_MS);
  const iso = local.toISOString();
  return {
    fecEmi: iso.split('T')[0],
    horEmi: iso.split('T')[1].split('.')[0],
  };
}
