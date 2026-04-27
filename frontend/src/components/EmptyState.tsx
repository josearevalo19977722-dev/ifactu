import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Emoji o carácter decorativo; omitir para no mostrar icono */
  icon?: string | null;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Menos padding (celdas de tabla) */
  compact?: boolean;
}

/**
 * Estado vacío con título, texto opcional y CTAs. Usar `compact` dentro de `<td colSpan>`.
 */
export function EmptyState({ icon = '📭', title, description, actions, compact }: EmptyStateProps) {
  const rich = Boolean(description || actions);

  return (
    <div
      className={[
        'empty-state',
        compact ? 'empty-state--compact' : '',
        rich ? 'empty-state--rich' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      {icon != null && icon !== '' && (
        <div className="empty-state-icon" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </div>
  );
}
