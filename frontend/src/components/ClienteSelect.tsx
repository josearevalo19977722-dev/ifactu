import { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

export interface Cliente {
  id: string;
  nombre: string;
  nit: string | null;
  numDocumento: string;
  tipoDocumento?: string;
  nrc: string | null;
  correo: string | null;
  telefono: string | null;
  codActividad: string | null;
  descActividad: string | null;
  direccionDepartamento: string | null;
  direccionMunicipio: string | null;
  direccionComplemento: string | null;
  esGranContribuyente?: boolean;
  codPais?: string;
  nombrePais?: string;
}

interface Props {
  onSelect: (cliente: Cliente) => void;
  placeholder?: string;
}

export function ClienteSelect({ onSelect, placeholder = "Buscar cliente por nombre, NIT o DUI..." }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (busqueda.length < 2) {
      setResultados([]);
      return;
    }

    const handler = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get(`/contactos/buscar?q=${busqueda}`);
        setResultados(data);
      } catch (err) {
        console.error('Error buscando clientes:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [busqueda]);

  const seleccionar = (cliente: Cliente) => {
    onSelect(cliente);
    setBusqueda(cliente.nombre);
    setOpen(false);
  };

  return (
    <div className="actividad-wrap cliente-search-panel">
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span aria-hidden>🔍</span> Buscar en catálogo de clientes
      </label>
      <div style={{ position: 'relative' }}>
        <input
          className="actividad-input"
          placeholder={placeholder}
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          autoComplete="off"
          style={{ background: 'var(--input-bg)' }}
        />
        {loading && (
          <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
            <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
          </div>
        )}
      </div>

      {open && resultados.length > 0 && (
        <ul className="actividad-dropdown" style={{ top: '100%' }}>
          {resultados.map((c) => (
            <li key={c.id} onMouseDown={() => seleccionar(c)} style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{c.nombre}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                  {c.nit || c.numDocumento} {c.nrc ? ` | NRC: ${c.nrc}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      
      {open && busqueda.length >= 2 && !loading && resultados.length === 0 && (
        <div className="actividad-dropdown" style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--text-3)', top: '100%' }}>
          No se encontraron clientes que coincidan con "{busqueda}"
        </div>
      )}
    </div>
  );
}
