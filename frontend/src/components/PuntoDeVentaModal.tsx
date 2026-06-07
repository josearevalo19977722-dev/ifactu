import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

interface Opcion {
  codigo: string;
  label: string;
  descripcion: string;
  icono: string;
  ruta: string;
  color: string;
}

const OPCIONES: Opcion[] = [
  {
    codigo: '01',
    label: 'Factura CF',
    descripcion: 'Consumidor final',
    icono: '🧾',
    ruta: '/cf/nuevo',
    color: '#3b82f6',
  },
  {
    codigo: '03',
    label: 'Crédito Fiscal',
    descripcion: 'Contribuyentes con NIT',
    icono: '📄',
    ruta: '/ccf/nuevo',
    color: '#8b5cf6',
  },
  {
    codigo: '04',
    label: 'Nota de Remisión',
    descripcion: 'Traslado de bienes',
    icono: '🚚',
    ruta: '/nre/nuevo',
    color: '#f59e0b',
  },
  {
    codigo: '11',
    label: 'Exportación',
    descripcion: 'Factura de exportación',
    icono: '🌍',
    ruta: '/fexe/nuevo',
    color: '#10b981',
  },
  {
    codigo: '07',
    label: 'Retención',
    descripcion: 'Comprobante de retención',
    icono: '🏦',
    ruta: '/retencion/nuevo',
    color: '#ef4444',
  },
  {
    codigo: '14',
    label: 'Sujeto Excluido',
    descripcion: 'Personas naturales',
    icono: '👤',
    ruta: '/fse/nuevo',
    color: '#06b6d4',
  },
  {
    codigo: '15',
    label: 'Donación',
    descripcion: 'Comprobante de donación',
    icono: '🎁',
    ruta: '/donacion/nuevo',
    color: '#ec4899',
  },
];

interface Props {
  tiposHabilitados: string[] | undefined | null;
  onClose: () => void;
}

export function PuntoDeVentaModal({ tiposHabilitados, onClose }: Props) {
  const navigate = useNavigate();

  const opciones = OPCIONES.filter(o =>
    !tiposHabilitados || tiposHabilitados.length === 0
      ? true
      : tiposHabilitados.includes(o.codigo),
  );

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const ir = (ruta: string) => {
    onClose();
    navigate(ruta);
  };

  return (
    <div className="pdv-overlay" onClick={onClose}>
      <div className="pdv-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="pdv-header">
          <div>
            <span className="pdv-header-icon">🖥️</span>
            <span className="pdv-header-title">Punto de Venta</span>
          </div>
          <button className="pdv-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <p className="pdv-subtitle">¿Qué documento querés emitir?</p>

        {/* Grid de cards */}
        <div className="pdv-grid">
          {opciones.map(op => (
            <button
              key={op.codigo}
              className="pdv-card"
              onClick={() => ir(op.ruta)}
              style={{ '--pdv-color': op.color } as React.CSSProperties}
            >
              <span className="pdv-card-icon">{op.icono}</span>
              <span className="pdv-card-label">{op.label}</span>
              <span className="pdv-card-desc">{op.descripcion}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
