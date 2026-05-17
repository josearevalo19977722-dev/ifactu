import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DireccionFields } from '../../components/DireccionFields';
import { ActividadSelect } from '../../components/ActividadSelect';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';
import { ConfirmEmitirModal } from '../../components/ConfirmEmitirModal';
import { useToast } from '../../context/ToastContext';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';
import { useGuardarCliente } from '../../hooks/useGuardarCliente';
import { GuardarClienteModal } from '../../components/GuardarClienteModal';

import { ClienteSelect, type Cliente } from '../../components/ClienteSelect';
import { ProductoSelect, type Producto } from '../../components/ProductoSelect';

import apiClient from '../../api/apiClient';
const api = apiClient;

interface ItemNre {
  numItem: number; tipoItem: number; cantidad: number; uniMedida: number;
  descripcion: string; precioUni: number; montoDescu: number;
  ventaNoSuj: number; ventaExenta: number; ventaGravada: number;
}
interface NreForm {
  dteReferenciadoId?: string;
  receptor: {
    nit: string; nrc: string; nombre: string; codActividad: string;
    descActividad: string; direccionDepartamento: string;
    direccionMunicipio: string; direccionComplemento: string;
    telefono?: string; correo?: string;
  };
  items: ItemNre[];
  condicionOperacion: number;
  puntoEntrega?: string;
  observaciones?: string;
}

const itemVacio: ItemNre = {
  numItem: 1, tipoItem: 1, cantidad: 1, uniMedida: 59,
  descripcion: '', precioUni: 0, montoDescu: 0,
  ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 0,
};

export function NuevaNre() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pendingData, setPendingData] = useState<NreForm | null>(null);
  const { marcarDelCatalogo, checkGuardarCliente, clienteNuevoModal, setClienteNuevoModal, marcarGuardado } = useGuardarCliente();
  const { register, control, handleSubmit, watch, setValue, getValues } = useForm<NreForm>({
    defaultValues: { condicionOperacion: 1, items: [{ ...itemVacio }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const mutation = useMutation({
    mutationFn: (data: NreForm) => api.post('/dte/nre', data).then(r => r.data),
    onSuccess: (dte) => {
      handleDteEmitido(dte, toast, 'Nota de Remisión');
      navigate(`/dte/${dte.id}`);
    },
    onError: (err: unknown) => {
      setPendingData(null);
      toast.error('Error al emitir NRE', parseApiError(err)[0]);
    },
  });

  const items = watch('items');
  const recalcular = (index: number) => {
    const item = items[index];
    if (!item) return;
    const gravada = Math.round((Number(item.cantidad) * Number(item.precioUni) - Number(item.montoDescu)) * 100) / 100;
    setValue(`items.${index}.ventaGravada`, gravada < 0 ? 0 : gravada);
  };

  const totalGravada = items.reduce((s, i) => s + (Number(i.ventaGravada) || 0), 0);
  const iva = Math.round(totalGravada * 0.13 * 100) / 100;
  const totalPagar = totalGravada + iva;

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
    marcarDelCatalogo();
  };

  const onProductoSelect = (index: number, p: Producto) => {
    setValue(`items.${index}.descripcion`, p.nombre);
    if (p.precioVenta) setValue(`items.${index}.precioUni`, Number(p.precioVenta));
    if (p.uniMedidaMh) setValue(`items.${index}.uniMedida`, p.uniMedidaMh);
    if (p.tipoItem) setValue(`items.${index}.tipoItem`, p.tipoItem);
    recalcular(index);
  };

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">Nueva Nota de Remisión (NRE)</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={() => navigate('/')}>Cancelar</button>
        </div>
      </div>

      <div className="page">
        <form onSubmit={handleSubmit((data) => {
          checkGuardarCliente(data.receptor ?? {});
          setPendingData(data);
        })}>

          {/* Receptor */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title"><span className="section-icon">🏢</span>Datos del receptor *</span>
            </div>
            <div className="form-section-body">
              <ClienteSelect onSelect={onClienteSelect} />
              <div className="form-grid">
                <div className="field field-full">
                  <label>Nombre / Razón social *</label>
                  <input {...register('receptor.nombre', { required: true })} />
                </div>
                <div className="field">
                  <label>NIT *</label>
                  <input {...register('receptor.nit', { required: true })} placeholder="0000-000000-000-0" />
                </div>
                <div className="field">
                  <label>NRC *</label>
                  <input {...register('receptor.nrc', { required: true })} />
                </div>
                <div className="field">
                  <label>Correo</label>
                  <input type="email" {...register('receptor.correo')} />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input {...register('receptor.telefono')} />
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
                  watch={watch}
                />
              </div>
            </div>
          </div>

          {/* Detalle */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title"><span className="section-icon">📦</span>Detalle de bienes</span>
              <button type="button" className="btn btn-sm" onClick={() => append({ ...itemVacio, numItem: fields.length + 1 })}>
                + Agregar ítem
              </button>
            </div>
            <div className="form-section-body">
              {fields.map((field, index) => (
                <div key={field.id} className="item-row">
                  <div className="item-row-num">{index + 1}</div>
                  <div className="item-fields">
                    <div className="form-grid">
                      <div className="field field-full">
                        <label>Descripción *</label>
                        <ProductoSelect
                          onSelect={(p) => onProductoSelect(index, p)}
                          placeholder="Buscar producto o escribir descripción..."
                        />
                        <input
                          style={{ marginTop: 8 }}
                          {...register(`items.${index}.descripcion`, { required: true })}
                          placeholder="Descripción del ítem"
                        />
                      </div>
                      <div className="field">
                        <label>Tipo ítem</label>
                        <select {...register(`items.${index}.tipoItem`, { valueAsNumber: true })}>
                          <option value={1}>Bien</option>
                          <option value={2}>Servicio</option>
                          <option value={3}>Ambos</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Unidad de medida</label>
                        <select {...register(`items.${index}.uniMedida`, { valueAsNumber: true })}>
                          {UNIDADES_MEDIDA.map(u => <option key={u.codigo} value={u.codigo}>{u.descripcion}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Cantidad</label>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.cantidad`, { valueAsNumber: true })}
                          onChange={e => { setValue(`items.${index}.cantidad`, Number(e.target.value)); recalcular(index); }}
                        />
                      </div>
                      <div className="field">
                        <label>Precio unit. (sin IVA)</label>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.precioUni`, { valueAsNumber: true })}
                          onChange={e => { setValue(`items.${index}.precioUni`, Number(e.target.value)); recalcular(index); }}
                        />
                      </div>
                      <div className="field">
                        <label>Descuento</label>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.montoDescu`, { valueAsNumber: true })}
                          onChange={e => { setValue(`items.${index}.montoDescu`, Number(e.target.value)); recalcular(index); }}
                        />
                      </div>
                      <div className="field">
                        <label>Venta gravada</label>
                        <input type="number" step="0.01" readOnly {...register(`items.${index}.ventaGravada`, { valueAsNumber: true })} />
                        <span className="field-hint">Calculado automático</span>
                      </div>
                    </div>
                  </div>
                  {fields.length > 1 && (
                    <div className="item-remove">
                      <button type="button" className="btn-remove" onClick={() => remove(index)}>✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Entrega y pago */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title"><span className="section-icon">🚚</span>Entrega y condiciones</span>
            </div>
            <div className="form-section-body">
              <div className="form-grid">
                <div className="field">
                  <label>Condición de operación</label>
                  <select {...register('condicionOperacion', { valueAsNumber: true })}>
                    <option value={1}>Contado</option>
                    <option value={2}>Crédito</option>
                    <option value={3}>Otro</option>
                  </select>
                </div>
                <div className="field">
                  <label>Punto de entrega</label>
                  <input {...register('puntoEntrega')} placeholder="Dirección de entrega" />
                </div>
                <div className="field field-full">
                  <label>ID del CCF que origina este traslado <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(opcional)</span></label>
                  <input {...register('dteReferenciadoId')} placeholder="UUID del CCF relacionado" />
                  <span className="field-hint">Si este traslado está vinculado a un Crédito Fiscal emitido anteriormente</span>
                </div>
                <div className="field">
                  <label>Observaciones</label>
                  <input {...register('observaciones')} placeholder="Opcional" />
                </div>
              </div>
            </div>
          </div>

          <div className="totales-bar">
            <div className="totales-item"><span className="totales-label">Subtotal</span><span className="totales-value">${totalGravada.toFixed(2)}</span></div>
            <div className="totales-item"><span className="totales-label">IVA 13%</span><span className="totales-value">${iva.toFixed(2)}</span></div>
            <div className="totales-item totales-total"><span className="totales-label">Total</span><span className="totales-value">${totalPagar.toFixed(2)}</span></div>
          </div>

          {mutation.isError && (
            <div className="alert alert-error">
              {parseApiError(mutation.error).map((e, i) => <div key={i}>⚠️ {e}</div>)}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn" onClick={() => navigate('/')}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Emitiendo...' : '🚚 Emitir Nota de Remisión'}
            </button>
          </div>
        </form>

        {pendingData && (
          <ConfirmEmitirModal
            titulo="Nota de Remisión"
            receptor={watch('receptor.nombre') || ''}
            total={totalPagar}
            nItems={pendingData.items.length}
            loading={mutation.isPending}
            onConfirm={() => { mutation.mutate(pendingData); }}
            onCancel={() => setPendingData(null)}
          />
        )}

        {clienteNuevoModal && <GuardarClienteModal datos={clienteNuevoModal} onClose={() => setClienteNuevoModal(null)} onGuardado={marcarGuardado} />}
      </div>
    </div>
  );
}
