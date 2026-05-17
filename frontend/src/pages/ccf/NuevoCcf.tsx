import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { useGuardarCliente } from '../../hooks/useGuardarCliente';
import { GuardarClienteModal } from '../../components/GuardarClienteModal';
import { dteApi } from '../../api/dte.api';
import type { CreateCcfPayload } from '../../types/dte';
import { DireccionFields } from '../../components/DireccionFields';
import { ActividadSelect } from '../../components/ActividadSelect';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';
import { FORMAS_PAGO } from '../../catalogs/formasPago';
import { ConfirmEmitirModal } from '../../components/ConfirmEmitirModal';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';
import { useToast } from '../../context/ToastContext';

import { ClienteSelect, type Cliente } from '../../components/ClienteSelect';
import { ProductoSelect, type Producto } from '../../components/ProductoSelect';

const itemVacio: any = {
  numItem: 1, tipoItem: 1, cantidad: 1, uniMedida: 59,
  descripcion: '', precioUni: 0, montoDescu: 0,
  ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 0,
  incluyeIva: false,
};

export function NuevoCcf() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [pendingData, setPendingData] = useState<CreateCcfPayload | null>(null);
  const { marcarDelCatalogo, checkGuardarCliente, clienteNuevoModal, setClienteNuevoModal, marcarGuardado } = useGuardarCliente();
  const { register, control, handleSubmit, watch, setValue, getValues } =
    useForm<CreateCcfPayload>({
      defaultValues: {
        condicionOperacion: 1,
        pagos: [{ codigo: '01', montoPago: 0 }],
        items: [{ ...itemVacio }],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const mutation = useMutation({
    mutationFn: dteApi.emitirCcf,
    onSuccess: (dte) => {
      handleDteEmitido(dte, toast, 'Crédito Fiscal');
      navigate(`/dte/${dte.id}`);
    },
    onError: (err) => {
      setPendingData(null);
      toast.error('Error al emitir', parseApiError(err)[0]);
    },
  });
  
  const { data: empresa } = useQuery({
    queryKey: ['empresa'],
    queryFn: () => apiClient.get('/empresa').then(r => r.data),
  });

  const items = watch('items') || [];
  const esGranContribuyente = watch('receptor.esGranContribuyente') || false;
  const condicion = watch('condicionOperacion');

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
    setValue('receptor.esGranContribuyente', !!c.esGranContribuyente);
    marcarDelCatalogo();
  };

  const onProductoSelect = (index: number, p: Producto) => {
    setValue(`items.${index}.descripcion`, p.nombre);
    if (p.precioVenta) setValue(`items.${index}.precioUni`, Number(p.precioVenta));
    if (p.codigo) setValue(`items.${index}.codigo`, p.codigo);
    else if (p.sku) setValue(`items.${index}.codigo`, p.sku);
    if (p.uniMedidaMh) setValue(`items.${index}.uniMedida`, p.uniMedidaMh);
    if (p.tipoItem) setValue(`items.${index}.tipoItem`, p.tipoItem);
    if (p.stockActual !== undefined) setStockMap(prev => ({ ...prev, [index]: p.stockActual! }));
    recalcular(index);
  };

  const recalcular = (index: number) => {
    const item = getValues(`items.${index}`);
    if (!item) return;
    const isInclusive = !!item.incluyeIva;
    const precioBase = isInclusive ? (Number(item.precioUni) / 1.13) : Number(item.precioUni);
    const gravada = Math.round((Number(item.cantidad) * precioBase - Number(item.montoDescu)) * 100) / 100;
    setValue(`items.${index}.ventaGravada`, gravada < 0 ? 0 : gravada);
  };

  const totalGravada = items.reduce((s, i) => s + (Number(i.ventaGravada) || 0), 0);

  // IVA usando método residual para items con precio IVA incluido,
  // así 5.00 IVA-inc → base 4.42 + IVA 0.58 = 5.00 exacto.
  const iva = Math.round(
    items.reduce((s, i) => {
      const vg   = Number(i.ventaGravada) || 0;
      if (i.incluyeIva && vg > 0) {
        const bruto = Math.round(Number(i.precioUni) * (Number(i.cantidad) || 1) * 100) / 100;
        return s + Math.round((bruto - vg) * 100) / 100;
      }
      return s + Math.round(vg * 0.13 * 100) / 100;
    }, 0) * 100
  ) / 100;

  // Retención 1% IVA: si total > 100 y receptor es Grande y emisor NO es agente
  const aplicaRetencion = totalGravada >= 100 && !!esGranContribuyente && empresa && !empresa.esAgenteRetencion;
  const retencion = aplicaRetencion ? Math.round(totalGravada * 0.01 * 100) / 100 : 0;

  const totalPagar = Math.round((totalGravada + iva - retencion) * 100) / 100;

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">Nuevo Comprobante de Crédito Fiscal</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={() => navigate('/')}>Cancelar</button>
        </div>
      </div>

      <div className="page">
        <form onSubmit={handleSubmit((data) => {
          data.pagos[0].montoPago = totalPagar;
          // Se envía el precioUni original al backend (IVA-inc o sin IVA según flag).
          // El backend hace la conversión y calcula IVA residual para preservar el total exacto.
          const finalData = { ...data };
          checkGuardarCliente(data.receptor ?? {});
          setPendingData(finalData as CreateCcfPayload);
        })}>

          {/* Receptor */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">
                <span className="section-icon">🏢</span>
                Datos del receptor *
              </span>
            </div>
            <div className="form-section-body">
              <ClienteSelect onSelect={onClienteSelect} />
              
              <div className="form-grid">
                <div className="field field-full">
                  <label>Nombre / Razón social *</label>
                  <input {...register('receptor.nombre', { required: true })} placeholder="Nombre de la empresa" />
                </div>
                <div className="field">
                  <label>NIT *</label>
                  <input {...register('receptor.nit', { required: true })} placeholder="0000-000000-000-0" />
                </div>
                <div className="field">
                  <label>NRC {esGranContribuyente ? '*' : ''}</label>
                  <input {...register('receptor.nrc', { required: esGranContribuyente })} placeholder="000000-0" />
                </div>
                <div className="field">
                  <label>Correo</label>
                  <input type="email" {...register('receptor.correo')} />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input {...register('receptor.telefono')} />
                </div>
                <div className="field" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input type="checkbox" id="esGranContribuyente" {...register('receptor.esGranContribuyente')} />
                  <label htmlFor="esGranContribuyente" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    El cliente es Grande Contribuyente (Aplica Retención 1%)
                  </label>
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
              </div>
            </div>
          </div>

          {/* Detalle */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">
                <span className="section-icon">📦</span>
                Detalle de productos/servicios
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => append({ ...itemVacio, numItem: fields.length + 1 })}
              >
                + Agregar ítem
              </button>
            </div>
            <div className="form-section-body">
              {fields.map((field, index) => (
                <div key={field.id} className="item-row">
                  <div className="item-row-num">{index + 1}</div>
                  <div className="item-fields">
                    <div className="item-grid">
                      <div className="field field-full">
                        <label>Descripción *</label>
                        <ProductoSelect
                          onSelect={(p) => onProductoSelect(index, p)}
                          placeholder="Buscar producto o servicio..."
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
                          {UNIDADES_MEDIDA.map(u => (
                            <option key={u.codigo} value={u.codigo}>{u.descripcion}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Cantidad</label>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.cantidad`, { valueAsNumber: true })}
                          onChange={(e) => { setValue(`items.${index}.cantidad`, Number(e.target.value)); recalcular(index); }}
                        />
                        {stockMap[index] !== undefined && Number(items[index]?.cantidad) > stockMap[index] && (
                          <span style={{ color: '#ef4444', fontSize: 12, marginTop: 2, display: 'block' }}>
                            Stock disponible: {stockMap[index]}
                          </span>
                        )}
                      </div>
                      <div className="field">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <label style={{ margin: 0 }}>Precio unitario</label>
                          <label className={`iva-toggle-pill ${getValues(`items.${index}.incluyeIva`) ? 'active' : ''}`}>
                            <input
                              type="checkbox"
                              style={{ display: 'none' }}
                              {...register(`items.${index}.incluyeIva`)}
                              onChange={(e) => {
                                setValue(`items.${index}.incluyeIva`, e.target.checked);
                                recalcular(index);
                              }}
                            />
                            {getValues(`items.${index}.incluyeIva`) ? 'IVA Inc.' : '+ IVA'}
                          </label>
                        </div>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.precioUni`, { valueAsNumber: true })}
                          onBlur={() => recalcular(index)}
                          onChange={(e) => { setValue(`items.${index}.precioUni`, Number(e.target.value)); recalcular(index); }}
                        />
                        {items[index]?.incluyeIva && (
                          <span style={{ fontSize: 9, color: 'var(--primary)', fontWeight: 600, display: 'block', marginTop: 2 }}>
                            Base: ${(Number(getValues(`items.${index}.precioUni`)) / 1.13).toFixed(4)}
                          </span>
                        )}
                      </div>
                      <div className="field">
                        <label>Descuento</label>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.montoDescu`, { valueAsNumber: true })}
                          onChange={(e) => { setValue(`items.${index}.montoDescu`, Number(e.target.value)); recalcular(index); }}
                        />
                      </div>
                      <div className="field">
                        <label>Venta gravada</label>
                        <input type="number" step="0.01" readOnly
                          {...register(`items.${index}.ventaGravada`, { valueAsNumber: true })}
                        />
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

          {/* Pago */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">
                <span className="section-icon">💳</span>
                Condiciones de pago
              </span>
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
                  <label>Forma de pago</label>
                  <select {...register('pagos.0.codigo')}>
                    {FORMAS_PAGO.map((fp) => (
                      <option key={fp.codigo} value={fp.codigo}>
                        {fp.descripcion}
                      </option>
                    ))}
                  </select>
                </div>
                {Number(condicion) === 2 && (
                  <div className="field">
                    <label>Plazo de crédito *</label>
                    <select {...register('pagos.0.plazo', { required: Number(condicion) === 2 })}>
                      <option value="">— Seleccionar —</option>
                      <option value="01">30 días</option>
                      <option value="02">60 días</option>
                      <option value="03">90 días</option>
                      <option value="04">Otro</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Totales */}
          <div className="totales-bar">
            <div className="totales-item">
              <span className="totales-label">Subtotal (sin IVA)</span>
              <span className="totales-value">${totalGravada.toFixed(2)}</span>
            </div>
            <div className="totales-item">
              <span className="totales-label">IVA 13%</span>
              <span className="totales-value">${iva.toFixed(2)}</span>
            </div>
            {retencion > 0 && (
              <div className="totales-item" style={{ color: 'var(--danger)' }}>
                <span className="totales-label">(-) Retención 1%</span>
                <span className="totales-value">-${retencion.toFixed(2)}</span>
              </div>
            )}
            <div className="totales-item totales-total">
              <span className="totales-label">Total a pagar</span>
              <span className="totales-value">${totalPagar.toFixed(2)}</span>
            </div>
          </div>

          {mutation.isError && (
            <div className="alert alert-error">
              {parseApiError(mutation.error).map((e, i) => <div key={i}>⚠️ {e}</div>)}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn" onClick={() => navigate('/')}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Emitiendo...' : '📄 Emitir Crédito Fiscal'}
            </button>
          </div>
        </form>

        {pendingData && (
          <ConfirmEmitirModal
            titulo="Crédito Fiscal"
            receptor={watch('receptor.nombre') || ''}
            total={totalPagar}
            nItems={pendingData.items.length}
            loading={mutation.isPending}
            onConfirm={() => { mutation.mutate(pendingData); }}
            onCancel={() => setPendingData(null)}
          />
        )}

        {clienteNuevoModal && (
          <GuardarClienteModal
            datos={clienteNuevoModal}
            onClose={() => setClienteNuevoModal(null)}
            onGuardado={marcarGuardado}
          />
        )}
      </div>
    </div>
  );
}
