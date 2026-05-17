import { useState } from 'react';
import type { UseFormGetValues, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { DEPARTAMENTOS, getDistritos, getMunicipios } from '../catalogs/departamentos';

interface Props {
  fieldDepartamento: string;
  fieldMunicipio: string;
  fieldComplemento: string;
  register: UseFormRegister<any>;
  setValue: UseFormSetValue<any>;
  getValues: UseFormGetValues<any>;
  watch: UseFormWatch<any>;
  defaultDepartamento?: string;
}

export function DireccionFields({
  fieldDepartamento,
  fieldMunicipio,
  fieldComplemento,
  register,
  setValue,
  getValues,
  watch,
}: Props) {
  // Usar watch para que los selects reaccionen a setValue externo (ej: cargar cliente del catálogo)
  const deptoSeleccionado = watch(fieldDepartamento) || '';
  const muniSeleccionado  = watch(fieldMunicipio)    || '';
  const [distrito, setDistrito] = useState('');
  const municipios = getMunicipios(deptoSeleccionado);
  const distritos = getDistritos(deptoSeleccionado, muniSeleccionado);

  const aplicarDistritoEnComplemento = () => {
    const rawComplemento = String(getValues(fieldComplemento) || '');
    const cleanComplemento = rawComplemento
      .replace(/^Distrito:\s*[^,]+,\s*/i, '')
      .trim();
    const cleanDistrito = distrito.trim();
    const merged = cleanDistrito
      ? `Distrito: ${cleanDistrito}, ${cleanComplemento}`.replace(/,\s*$/, '')
      : cleanComplemento;
    setValue(fieldComplemento, merged, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <div className="field">
        <label>Departamento *</label>
        <select
          {...register(fieldDepartamento, { required: true })}
          onChange={() => {
            setDistrito('');
            setValue(fieldMunicipio, '', { shouldDirty: true });
          }}
        >
          <option value="">Seleccionar...</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.codigo} value={d.codigo}>
              {d.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Municipio *</label>
        <select
          {...register(fieldMunicipio, { required: true })}
          disabled={!deptoSeleccionado}
          onChange={() => {
            setDistrito('');
          }}
        >
          <option value="">Seleccionar...</option>
          {municipios.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="field field-full">
        <label>Distrito (según ordenamiento territorial 2024)</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={distrito}
            onChange={(e) => setDistrito(e.target.value)}
            disabled={!muniSeleccionado}
          >
            <option value="">Seleccionar distrito...</option>
            {distritos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            value={distrito}
            onChange={(e) => setDistrito(e.target.value)}
            placeholder="O escribir distrito manualmente"
          />
          <button type="button" className="btn btn-sm" onClick={aplicarDistritoEnComplemento}>
            Aplicar
          </button>
        </div>
        <small style={{ opacity: 0.8 }}>
          Se agrega al inicio del complemento como "Distrito: ...", conforme a la instruccion 13.1 del manual.
        </small>
      </div>

      <div className="field field-full">
        <label>Complemento dirección *</label>
        <input
          {...register(fieldComplemento, { required: true })}
          placeholder="Calle, Avenida, Col., N°..."
        />
      </div>
    </>
  );
}
