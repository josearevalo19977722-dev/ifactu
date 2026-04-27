/**
 * Formato USD para tablas y KPIs (consistente en la app).
 */
export function formatUsd(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'string' ? Number(n) : n;
  if (Number.isNaN(num)) return '—';
  return `$${num.toFixed(2)}`;
}
