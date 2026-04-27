import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DireccionFields } from '../../components/DireccionFields';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';
import { ConfirmEmitirModal } from '../../components/ConfirmEmitirModal';
import { useToast } from '../../context/ToastContext';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';

import { ClienteSelect, type Cliente } from '../../components/ClienteSelect';
import { ProductoSelect, type Producto } from '../../components/ProductoSelect';
import { ActividadSelect } from '../../components/ActividadSelect';

import apiClient from '../../api/apiClient';
const api = apiClient;

interface ItemFse {
  numItem: number;
  tipoItem: number;
  cantidad: number;
  codigo?: string;
  uniMedida: number;
  descripcion: string;
  precioUni: number;
  montoDescu: number;
  compraNoSujeta: number;
  compraExenta: number;
  compraAfectada: number;
}

interface FseForm {
  receptor: {
    tipoDocumento: string;
    numDocumento: string;
    nombre: string;
    codActividad?: string;
    descActividad?: string;
    direccionDepartamento: string;
    direccionMunicipio: string;
    direccionComplemento: string;
    telefono?: string;
    correo?: string;
  };
  items: ItemFse[];
  condicionOperacion: number;
  observaciones?: string;
}

const itemVacio: ItemFse = {
  numItem: 1, tipoItem: 1, cantidad: 1, uniMedida: 59,
  descripcion: '', precioUni: 0, montoDescu: 0,
  compraNoSujeta: 0, compraExenta: 0, compraAfectada: 0,
};

export function NuevaFse() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [pendingData, setPendingData] = useState<FseForm | null>(null);
  const { register, control, handleSubmit, watch, setValue, getValues } = useForm<FseForm>({
    defaultValues: { condicionOperacion: 1, items: [{ ...itemVacio }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const mutation = useMutation({
    mutationFn: (data: FseForm) => api.post('/dte/fse', data).then(r => r.data),
    onSuccess: (dte) => {
      handleDteEmitido(dte, toast, 'Factura de Sujeto Excluido');
      navigate(`/dte/${dte.id}`);
    },
    onError: (err: unknown) => {
      setPendingData(null);
      toast.error('Error al emitir FSE', parseApiError(err)[0]);
    },
  });

  const items = watch('items');
  const recalcular = (index: number) => {
    const item = items[index];
    if (!item) return;
    const bruto = (Number(item.precioUni) || 0) * (Number(item.cantidad) || 0);
    const descu = Number(item.montoDescu) || 0;
    setValue(`items.${index}.compraAfectada`, Math.max(0, +(bruto - descu).toFixed(2)));
  };

  const onClienteSelect = (c: Cliente) => {
    setValue('receptor.nombre', c.nombre);
    setValue('receptor.numDocumento', c.numDocumento || '');
    setValue('receptor.tipoDocumento', c.tipoDocumento || '13');
    setValue('receptor.correo', c.correo || '');
    setValue('receptor.telefono', c.telefono || '');
    setValue('receptor.codActividad', c.codActividad || '');
    setValue('receptor.descActividad', c.descActividad || '');
    setValue('receptor.direccionDepartamento', c.direccionDepartamento || '');
    setValue('receptor.direccionMunicipio', c.direccionMunicipio || '');
    setValue('receptor.direccionComplemento', c.direccionComplemento || '');
  };

  const onProductoSelect = (index: number, p: Producto) => {
    setValue(`items.${index}.descripcion`, p.nombre);
    if (p.precioVenta) setValue(`items.${index}.precioUni`, Number(p.precioVenta));
    if (p.uniMedidaMh) setValue(`items.${index}.uniMedida`, p.uniMedidaMh);
    if (p.tipoItem) setValue(`items.${index}.tipoItem`, p.tipoItem);
    if (p.codigo) setValue(`items.${index}.codigo`, p.codigo);
    if (p.stockActual !== undefined) setStockMap(prev => ({ ...prev, [index]: p.stockActual! }));
    recalcular(index);
  };

  const totales = items.reduce((acc, i) => ({
    noSuj:  acc.noSuj  + (Number(i.compraNoSujeta)  || 0),
    exenta: acc.exenta + (Number(i.compraExenta)     || 0),
    afecta: acc.afecta + (Number(i.compraAfectada)   || 0),
    descu:  acc.descu  + (Number(i.montoDescu)        || 0),
  }), { noSuj: 0, exenta: 0, afecta: 0, descu: 0 });
  const totalPagar = totales.noSuj + totales.exenta + totales.afecta - totales.descu;

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">Nueva Factura Sujeto Excluido (14)</span>
      </div>

      <div style={{ padding: '20px 28px', maxWidth: 900 }}>
        <form onSubmit={handleSubmit(setPendingData)}>

          {/* Sujeto Excluido */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header"><span className="table-title">Sujeto Excluido (Receptor)</span></div>
            <div style={{ padding: '16px 20px' }}>
              <ClienteSelect onSelect={onClienteSelect} />
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tipo documento *</label>
                  <select className="form-control" {...register('receptor.tipoDocumento', { required: true })}>
                    <option value="13">13 - DUI</option>
                    <option value="36">36 - NIT</option>
                    <option value="02">02 - Pasaporte</option>
                    <option value="03">03 - Carné de residente</option>
                    <option value="37">37 - Otro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">N° documento *</label>
                  <input className="form-control" {...register('receptor.numDocumento', { required: true })} />
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
              <span className="table-title">Productos / Servicios</span>
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

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Tipo ítem</label>
                      <select className="form-control" {...register(`items.${idx}.tipoItem`, { valueAsNumber: true })}>
                        <option value={1}>1 - Bien</option>
                        <option value={2}>2 - Servicio</option>
                        <option value={3}>3 - Ambos</option>
                        <option value={4}>4 - Otro cargo</option>
                      </select>
                    </div>
                    {items[idx]?.tipoItem !== 2 && (
                      <div className="form-group">
                        <label className="form-label">Código</label>
                        <input className="form-control" {...register(`items.${idx}.codigo`)} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Unidad medida</label>
                      <select className="form-control" {...register(`items.${idx}.uniMedida`, { valueAsNumber: true })}>
                        {UNIDADES_MEDIDA.map(u => <option key={u.codigo} value={u.codigo}>{u.codigo} - {u.descripcion}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Descripción *</label>
                      <ProductoSelect
                        onSelect={(p) => onProductoSelect(idx, p)}
                        placeholder="Buscar producto para autocompletar (opcional)..."
                      />
                      <input
                        style={{ marginTop: 6 }}
                        className="form-control"
                        placeholder="Descripción del producto o servicio (aparece en el DTE)"
                        {...register(`items.${idx}.descripcion`, { required: true })}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Precio unitario</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.precioUni`, { valueAsNumber: true })}
                        onBlur={() => recalcular(idx)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cantidad</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.cantidad`, { valueAsNumber: true })}
                        onBlur={() => recalcular(idx)} />
                      {stockMap[idx] !== undefined && Number(items[idx]?.cantidad) > stockMap[idx] && (
                        <span style={{ color: '#ef4444', fontSize: 12, marginTop: 2, display: 'block' }}>
                          Stock disponible: {stockMap[idx]}
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Descuento</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.montoDescu`, { valueAsNumber: true })}
                        onBlur={() => recalcular(idx)} />
                    </div>
                  </div>

                  {items[idx]?.tipoItem !== 2 && (
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Compra no sujeta</label>
                        <input className="form-control" type="number" step="0.01" min="0"
                          {...register(`items.${idx}.compraNoSujeta`, { valueAsNumber: true })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Compra exenta</label>
                        <input className="form-control" type="number" step="0.01" min="0"
                          {...register(`items.${idx}.compraExenta`, { valueAsNumber: true })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Compra afectada</label>
                        <input className="form-control" type="number" step="0.01" min="0"
                          {...register(`items.${idx}.compraAfectada`, { valueAsNumber: true })} />
                      </div>
                    </div>
                  )}

                  {items[idx]?.tipoItem === 2 && (
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Compra afectada</label>
                        <input className="form-control" type="number" step="0.01" min="0" readOnly
                          style={{ background: 'var(--bg-subtle)' }}
                          {...register(`items.${idx}.compraAfectada`, { valueAsNumber: true })} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div style={{ padding: '16px 20px' }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Condición operación</label>
                  <select className="form-control" {...register('condicionOperacion', { valueAsNumber: true })}>
                    <option value={1}>1 - Contado</option>
                    <option value={2}>2 - Crédito</option>
                    <option value={3}>3 - Otro</option>
                  </select>
                </div>
              </div>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 16, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>No sujeta:</span><span>${totales.noSuj.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Exenta:</span><span>${totales.exenta.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Afecta:</span><span>${totales.afecta.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Descuento:</span><span>-${totales.descu.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <span>Total a pagar:</span><span>${totalPagar.toFixed(2)}</span>
                </div>
              </div>
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
              {mutation.isPending ? 'Emitiendo...' : 'Emitir Factura Sujeto Excluido'}
            </button>
            <button type="button" className="btn" onClick={() => navigate(-1)}>Cancelar</button>
          </div>
        </form>

        {pendingData && (
          <ConfirmEmitirModal
            titulo="Factura Sujeto Excluido"
            receptor={watch('receptor.nombre') || ''}
            total={totalPagar}
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
