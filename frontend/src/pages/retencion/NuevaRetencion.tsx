import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ConfirmEmitirModal } from '../../components/ConfirmEmitirModal';
import { useToast } from '../../context/ToastContext';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';
import { DireccionFields } from '../../components/DireccionFields';
import { ActividadSelect } from '../../components/ActividadSelect';

import { ClienteSelect, type Cliente } from '../../components/ClienteSelect';

import apiClient from '../../api/apiClient';
const api = apiClient;

interface ItemRetencion {
  numItem: number;
  tipoDteRelacionado: string;
  tipoDoc: number;
  tipo: number;
  codigoRetencionMH?: string;
  descripcion: string;
  numDocumento?: string;
  fechaDocumento?: string;
  compraNoSujetaIVA: number;
  compraExentaIVA: number;
  compraAfectaIVA: number;
  porcentajeRenta: number;
  ivaRetenido: number;
  montoSujetoGrav: number;
  descripcionDocRelacionado?: string;
}

interface RetencionForm {
  receptor: {
    nit: string;
    nrc: string;
    nombre: string;
    codActividad: string;
    descActividad: string;
    direccionDepartamento: string;
    direccionMunicipio: string;
    direccionComplemento: string;
    telefono?: string;
    correo?: string;
  };
  periodo: number;
  anio: number;
  items: ItemRetencion[];
  observaciones?: string;
}

const itemVacio: ItemRetencion = {
  numItem: 1, tipoDteRelacionado: '03', tipoDoc: 2, tipo: 1, codigoRetencionMH: 'C9',
  descripcion: '', numDocumento: '', fechaDocumento: '',
  compraNoSujetaIVA: 0, compraExentaIVA: 0, compraAfectaIVA: 0,
  porcentajeRenta: 0, ivaRetenido: 0, montoSujetoGrav: 0,
  descripcionDocRelacionado: '',
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function NuevaRetencion() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pendingData, setPendingData] = useState<RetencionForm | null>(null);
  const ahora = new Date();
  const { register, control, handleSubmit, setValue, watch, getValues } = useForm<RetencionForm>({
    defaultValues: {
      periodo: ahora.getMonth() + 1,
      anio: ahora.getFullYear(),
      items: [{ ...itemVacio }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const recalcular = (idx: number, campo?: string, valor?: number) => {
    const item = { ...items[idx] };
    if (campo) (item as any)[campo] = valor ?? 0;

    const tipoNum   = Number(item.tipo);
    const afecta    = Number(item.compraAfectaIVA)  || 0;
    const gravamen  = Number(item.montoSujetoGrav)  || 0;
    const pctRenta  = Number(item.porcentajeRenta)  || 0;

    // Monto sujeto gravamen = compra afecta (si el usuario cambió compraAfectaIVA, sincronizar)
    if (campo === 'compraAfectaIVA') {
      setValue(`items.${idx}.montoSujetoGrav`, valor ?? 0);
      if (tipoNum === 1) {
        setValue(`items.${idx}.ivaRetenido`, r2((valor ?? 0) * 0.13));
      } else {
        setValue(`items.${idx}.ivaRetenido`, r2((valor ?? 0) * pctRenta / 100));
      }
      return;
    }

    if (campo === 'montoSujetoGrav' && tipoNum === 2) {
      setValue(`items.${idx}.ivaRetenido`, r2((valor ?? 0) * pctRenta / 100));
      return;
    }

    if (campo === 'porcentajeRenta' && tipoNum === 2) {
      setValue(`items.${idx}.ivaRetenido`, r2(gravamen * (valor ?? 0) / 100));
      return;
    }

    if (campo === 'tipo') {
      if (tipoNum === 1) {
        setValue(`items.${idx}.ivaRetenido`, r2(afecta * 0.13));
        setValue(`items.${idx}.porcentajeRenta`, 0);
      } else {
        setValue(`items.${idx}.ivaRetenido`, r2(gravamen * pctRenta / 100));
      }
    }
  };

  const onClienteSelect = (c: Cliente) => {
    setValue('receptor.nombre', c.nombre);
    setValue('receptor.nit', c.nit || '');
    setValue('receptor.nrc', c.nrc || '');
    setValue('receptor.correo', c.correo || '');
    setValue('receptor.telefono', c.telefono || '');
    setValue('receptor.codActividad', c.codActividad || '');
    setValue('receptor.descActividad', c.descActividad || '');
    setValue('receptor.direccionDepartamento', c.direccionDepartamento || '');
    setValue('receptor.direccionMunicipio', c.direccionMunicipio || '');
    setValue('receptor.direccionComplemento', c.direccionComplemento || '');
  };

  const mutation = useMutation({
    mutationFn: (data: RetencionForm) => api.post('/dte/retencion', data).then(r => r.data),
    onSuccess: (dte) => {
      handleDteEmitido(dte, toast, 'Comprobante de Retención');
      navigate(`/dte/${dte.id}`);
    },
    onError: (err: unknown) => {
      setPendingData(null);
      toast.error('Error al emitir Retención', parseApiError(err)[0]);
    },
  });

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">Nuevo Comprobante de Retención (07)</span>
      </div>

      <div style={{ padding: '20px 28px', maxWidth: 900 }}>
        <form onSubmit={handleSubmit(setPendingData)}>

          {/* Período */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header"><span className="table-title">Período</span></div>
            <div style={{ padding: '16px 20px' }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mes</label>
                  <select className="form-control" {...register('periodo', { valueAsNumber: true, required: true })}>
                    {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Año</label>
                  <input className="form-control" type="number" {...register('anio', { valueAsNumber: true, required: true })} />
                </div>
              </div>
            </div>
          </div>

          {/* Receptor */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header"><span className="table-title">Receptor (Empresa)</span></div>
            <div style={{ padding: '16px 20px' }}>
              <ClienteSelect onSelect={onClienteSelect} />
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">NIT *</label>
                  <input className="form-control" placeholder="0000-000000-000-0" {...register('receptor.nit', { required: true })} />
                </div>
                <div className="form-group">
                  <label className="form-label">NRC *</label>
                  <input className="form-control" placeholder="000000-0" {...register('receptor.nrc', { required: true })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nombre / Razón Social *</label>
                  <input className="form-control" {...register('receptor.nombre', { required: true })} />
                </div>
              </div>
              <ActividadSelect
                fieldCodigo="receptor.codActividad"
                fieldDescripcion="receptor.descActividad"
                register={register}
                setValue={setValue}
                watch={watch}
                required
              />
              <DireccionFields
                fieldDepartamento="receptor.direccionDepartamento"
                fieldMunicipio="receptor.direccionMunicipio"
                fieldComplemento="receptor.direccionComplemento"
                register={register}
                setValue={setValue}
                getValues={getValues}
              />
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-control" {...register('receptor.telefono')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Correo</label>
                  <input className="form-control" type="email" {...register('receptor.correo')} />
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header">
              <span className="table-title">Detalle de Retenciones</span>
              <button type="button" className="btn btn-sm"
                onClick={() => append({ ...itemVacio, numItem: fields.length + 1 })}>
                + Agregar ítem
              </button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {fields.map((f, idx) => (
                <div key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>Ítem {idx + 1}</strong>
                    {fields.length > 1 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(idx)}>✕ Eliminar</button>
                    )}
                  </div>
                  <input type="hidden" {...register(`items.${idx}.numItem`, { valueAsNumber: true })} value={idx + 1} />

                  {/* Fila 1: Descripción + DTE origen */}
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Descripción *</label>
                      <input className="form-control" {...register(`items.${idx}.descripcion`, { required: true })} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">DTE que origina la retención</label>
                      <select className="form-control" {...register(`items.${idx}.tipoDteRelacionado`)}>
                        <option value="03">03 - Crédito Fiscal (CCF)</option>
                        <option value="01">01 - Consumidor Final (CF)</option>
                        <option value="11">11 - Exportación (FEXE)</option>
                        <option value="04">04 - Nota de Remisión (NRE)</option>
                      </select>
                    </div>
                  </div>

                  {/* Fila 1b: Tipo documento + N° Documento + Fecha */}
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Tipo de documento</label>
                      <select className="form-control" {...register(`items.${idx}.tipoDoc`, { valueAsNumber: true })}>
                        <option value={2}>Electrónico (DTE)</option>
                        <option value={1}>Físico (papel)</option>
                      </select>
                      <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {watch(`items.${idx}.tipoDoc`) === 1
                          ? '✅ Físico: Hacienda no valida el número'
                          : '⚠️ Electrónico: debe ser un UUID registrado en Hacienda'}
                      </small>
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">
                        {watch(`items.${idx}.tipoDoc`) === 1
                          ? 'N° documento físico (referencia libre)'
                          : 'codigoGeneracion del DTE recibido'}
                      </label>
                      <input className="form-control"
                        placeholder={watch(`items.${idx}.tipoDoc`) === 1 ? 'Ej: F-001, 00234...' : 'UUID del CCF recibido de tu proveedor'}
                        {...register(`items.${idx}.numDocumento`)} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Fecha del documento</label>
                      <input className="form-control" type="date"
                        {...register(`items.${idx}.fechaDocumento`)} />
                    </div>
                  </div>

                  {/* Fila 2: Tipo de retención + Categoría renta */}
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Tipo de retención</label>
                      <select className="form-control" {...register(`items.${idx}.tipo`, { valueAsNumber: true })}
                        onChange={e => {
                          const v = e.target.value;
                          setValue(`items.${idx}.tipo`, Number(v));
                          // Auto-seleccionar código MH por defecto según tipo
                          if (v === '1') setValue(`items.${idx}.codigoRetencionMH`, 'C9');
                          else if (v === '2') setValue(`items.${idx}.codigoRetencionMH`, 'C02');
                          recalcular(idx, 'tipo', Number(v));
                        }}>
                        <option value="1">1 - IVA retenido (13%)</option>
                        <option value="2">2 - Renta retenida</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Categoría de renta (MH)</label>
                      <select className="form-control" {...register(`items.${idx}.codigoRetencionMH`)}>
                        {/* IVA retenido (tipoDoc=1) — Catálogo 22 Hacienda */}
                        <option value="C9">C9 — IVA retenido 13%</option>
                        <option value="C4">C4 — IVA retenido 1%</option>
                        {/* Renta retenida (tipoDoc=2) — Catálogo 22 Hacienda */}
                        <option value="C00">C00 — Renta: Periodos anteriores</option>
                        <option value="C01">C01 — Renta: Profesiones, Artes y Oficios</option>
                        <option value="C02">C02 — Renta: Actividades de Servicios</option>
                        <option value="C03">C03 — Renta: Actividades Comerciales</option>
                        <option value="C04">C04 — Renta: Actividades Industriales</option>
                        <option value="C05">C05 — Renta: Actividades Agropecuarias</option>
                        <option value="C06">C06 — Renta: Utilidades y Dividendos</option>
                        <option value="C07">C07 — Renta: Exportaciones de Bienes</option>
                        <option value="C08">C08 — Renta: Servicios en el Exterior</option>
                        <option value="C09">C09 — Renta: Exportaciones de Servicios</option>
                        <option value="C10">C10 — Renta: Otras rentas Gravables</option>
                        <option value="C11">C11 — Renta: Ingresos ya retenidos</option>
                        <option value="C12">C12 — Renta: Sujetos excluidos (Art. 6)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Compra no sujeta IVA</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.compraNoSujetaIVA`, { valueAsNumber: true })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Compra exenta IVA</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.compraExentaIVA`, { valueAsNumber: true })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Compra afecta IVA *</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.compraAfectaIVA`, { valueAsNumber: true, required: true })}
                        onChange={e => { const v = Number(e.target.value); setValue(`items.${idx}.compraAfectaIVA`, v); recalcular(idx, 'compraAfectaIVA', v); }} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Monto sujeto gravamen *</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.montoSujetoGrav`, { valueAsNumber: true, required: true })}
                        onChange={e => { const v = Number(e.target.value); setValue(`items.${idx}.montoSujetoGrav`, v); recalcular(idx, 'montoSujetoGrav', v); }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">% Renta</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.porcentajeRenta`, { valueAsNumber: true })}
                        onChange={e => { const v = Number(e.target.value); setValue(`items.${idx}.porcentajeRenta`, v); recalcular(idx, 'porcentajeRenta', v); }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">IVA Retenido *</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.ivaRetenido`, { valueAsNumber: true, required: true })} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Descripción doc. relacionado</label>
                    <input className="form-control" {...register(`items.${idx}.descripcionDocRelacionado`)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Observaciones */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div style={{ padding: '16px 20px' }}>
              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea className="form-control" rows={2} {...register('observaciones')} />
              </div>
            </div>
          </div>

          {mutation.isError && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {parseApiError(mutation.error).map((e, i) => <div key={i}>⚠️ {e}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Emitiendo...' : 'Emitir Comprobante de Retención'}
            </button>
            <button type="button" className="btn" onClick={() => navigate(-1)}>Cancelar</button>
          </div>
        </form>

        {pendingData && (
          <ConfirmEmitirModal
            titulo="Comprobante de Retención"
            receptor={watch('receptor.nombre') || ''}
            total={pendingData.items.reduce((s, i) => s + (Number(i.ivaRetenido) || 0), 0)}
            nItems={pendingData.items.length}
            loading={mutation.isPending}
            onConfirm={() => { mutation.mutate(pendingData); }}
            onCancel={() => setPendingData(null)}
          />
        )}
      </div>
    </div>
  );
}
