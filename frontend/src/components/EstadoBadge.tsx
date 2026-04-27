import type { EstadoDte } from '../types/dte';

const clases: Record<EstadoDte, string> = {
  RECIBIDO:     'badge badge-recibido',
  RECHAZADO:    'badge badge-rechazado',
  PENDIENTE:    'badge badge-pendiente',
  CONTINGENCIA: 'badge badge-contingencia',
  ANULADO:      'badge badge-anulado',
};

const labels: Record<EstadoDte, string> = {
  RECIBIDO:     'Recibido',
  RECHAZADO:    'Rechazado',
  PENDIENTE:    'Pendiente',
  CONTINGENCIA: 'Contingencia',
  ANULADO:      'Anulado',
};

export function EstadoBadge({ estado }: { estado: EstadoDte }) {
  return <span className={clases[estado]}>{labels[estado]}</span>;
}
