import { useState, useEffect } from 'react';
import { ACTIVIDADES_ECONOMICAS } from '../catalogs/actividades';

interface Props {
  fieldCodigo: string;
  fieldDescripcion: string;
  register: any;
  setValue: any;
  watch: any;
  required?: boolean;
}

export function ActividadSelect({ fieldCodigo, fieldDescripcion, register, setValue, watch, required = false }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [open, setOpen] = useState(false);

  const currentCodigo = watch(fieldCodigo);
  const currentDesc = watch(fieldDescripcion);

  // Sincronizar búsqueda local con los valores del formulario (para inicialización o reset)
  useEffect(() => {
    if (currentCodigo && currentDesc) {
      setBusqueda(`${currentCodigo} — ${currentDesc}`);
    } else if (!currentCodigo && !currentDesc) {
      setBusqueda('');
    }
  }, [currentCodigo, currentDesc]);

  const filtradas = busqueda.length >= 2 && !busqueda.includes(' — ')
    ? ACTIVIDADES_ECONOMICAS.filter(
        (a) =>
          a.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
          a.codigo.includes(busqueda),
      ).slice(0, 50)
    : [];

  const seleccionar = (codigo: string, descripcion: string) => {
    setValue(fieldCodigo, codigo);
    setValue(fieldDescripcion, descripcion);
    setBusqueda(`${codigo} — ${descripcion}`);
    setOpen(false);
  };

  return (
    <div className="actividad-wrap">
      <label>Actividad económica {required ? '*' : ''}</label>
      <input
        className="actividad-input"
        placeholder="Buscar por código o descripción..."
        value={busqueda}
        onChange={(e) => { 
          setBusqueda(e.target.value); 
          setOpen(true);
          // Si el usuario borra la búsqueda, limpiamos los valores reales
          if (!e.target.value) {
            setValue(fieldCodigo, '');
            setValue(fieldDescripcion, '');
          }
        }}
        onFocus={() => {
          if (!busqueda.includes(' — ')) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        autoComplete="off"
      />
      <input type="hidden" {...register(fieldCodigo, { required })} />
      <input type="hidden" {...register(fieldDescripcion, { required })} />
      {open && filtradas.length > 0 && (
        <ul className="actividad-dropdown">
          {filtradas.map((a) => (
            <li key={a.codigo} onMouseDown={() => seleccionar(a.codigo, a.descripcion)}>
              <span className="act-codigo">{a.codigo}</span>
              <span>{a.descripcion}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
