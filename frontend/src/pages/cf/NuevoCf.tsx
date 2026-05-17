import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useGuardarCliente } from '../../hooks/useGuardarCliente';
import { GuardarClienteModal } from '../../components/GuardarClienteModal';
import { dteApi } from '../../api/dte.api';
import type { CreateCfPayload } from '../../types/dte';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';
import { FORMAS_PAGO } from '../../catalogs/formasPago';
import { ConfirmEmitirModal } from '../../components/ConfirmEmitirModal';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';
import { useToast } from '../../context/ToastContext';

import { ClienteSelect, type Cliente } from '../../components/ClienteSelect';
import { ProductoSelect, type Producto } from '../../components/ProductoSelect';

const itemVacio = {
  numItem: 1, tipoItem: 1, cantidad: 1, uniMedida: 59,
  descripcion: '', precioUni: 0, montoDescu: 0,
  ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 0,
};

export function NuevoCf() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stockMap, setStockMap] = useState<Record<number, number>>({});
  const [pendingData, setPendingData] = useState<CreateCfPayload | null>(null);
  const { marcarDelCatalogo, checkGuardarCliente, clienteNuevoModal, setClienteNuevoModal, marcarGuardado } = useGuardarCliente();
  const { register, control, handleSubmit, watch, setValue } =
    useForm<CreateCfPayload>({
      defaultValues: {
        condicionOperacion: 1,
        pagos: [{ codigo: '01', montoPago: 0 }],
        items: [{ ...itemVacio }],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const mutation = useMutation({
    mutationFn: dteApi.emitirCf,
    onSuccess: (dte) => {
      handleDteEmitido(dte, toast, 'Factura CF');
      navigate(`/dte/${dte.id}`);
    },
    onError: (err) => {
      setPendingData(null);
      toast.error('Error al emitir', parseApiError(err)[0]);
    },
  });

  const items = watch('items');
  const condicion = watch('condicionOperacion');

  const onClienteSelect = (c: Cliente) => {
    setValue('receptor.nombre', c.nombre);
    setValue('receptor.tipoDocumento', c.tipoDocumento || '');
    setValue('receptor.numDocumento', c.numDocumento || '');
    setValue('receptor.correo', c.correo || '');
    setValue('receptor.telefono', c.telefono || '');
    marcarDelCatalogo();
  };

  const onProductoSelect = (index: number, p: Producto) => {
    setValue(`items.${index}.descripcion`, p.nombre);
    if (p.precioVenta) setValue(`items.${index}.precioUni`, Number(p.precioVenta));
    if (p.uniMedidaMh) setValue(`items.${index}.uniMedida`, p.uniMedidaMh);
    if (p.tipoItem) setValue(`items.${index}.tipoItem`, p.tipoItem);
    if (p.codigo) setValue(`items.${index}.codigo` as any, p.codigo);
    if (p.stockActual !== undefined) setStockMap(prev => ({ ...prev, [index]: p.stockActual! }));
    recalcular(index);
  };

  const recalcular = (index: number) => {
    const item = items[index];
    if (!item) return;
    const gravada = Math.round((Number(item.cantidad) * Number(item.precioUni) - Number(item.montoDescu)) * 100) / 100;
    setValue(`items.${index}.ventaGravada`, gravada < 0 ? 0 : gravada);
  };

  const totalGravada = items.reduce((s, i) => s + (Number(i.ventaGravada) || 0), 0);
  const totalExenta = items.reduce((s, i) => s + (Number(i.ventaExenta) || 0), 0);
  const totalNoSuj = items.reduce((s, i) => s + (Number(i.ventaNoSuj) || 0), 0);
  const totalDescu = items.reduce((s, i) => s + (Number(i.montoDescu) || 0), 0);
  const totalPagar = totalGravada + totalExenta + totalNoSuj - totalDescu;
  const ivaIncluido = Math.round(totalGravada * 13 / 113 * 100) / 100;

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">Nueva Factura — Consumidor Final</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={() => navigate('/')}>Cancelar</button>
        </div>
      </div>

      <div className="page">
        <form onSubmit={handleSubmit((data) => {
          // Asegurar que montoPago refleje el total real antes de enviar
          const total = Math.round((data.items.reduce((s, i) => s + (i.precioUni * i.cantidad), 0)) * 100) / 100;
          data.pagos = data.pagos.map((p, i) => ({ ...p, montoPago: i === 0 ? total : p.montoPago }));
          checkGuardarCliente(data.receptor ?? {});
          setPendingData(data);
        })}>

          {/* Receptor */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">
                <span className="section-icon">👤</span>
                Receptor <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: '.78rem' }}>(opcional)</span>
              </span>
            </div>
            <div className="form-section-body">
              <ClienteSelect onSelect={onClienteSelect} />
              <div className="form-grid">
                <div className="field">
                  <label>Nombre</label>
                  <input {...register('receptor.nombre')} placeholder="Consumidor Final" />
                </div>
                <div className="field">
                  <label>Tipo documento</label>
                  <select {...register('receptor.tipoDocumento', { setValueAs: v => v === "" ? undefined : v })}>
                    <option value="">Sin documento</option>
                    <option value="13">DUI (13)</option>
                    <option value="36">NIT (36)</option>
                    <option value="02">Pasaporte (02)</option>
                    <option value="03">Carné residente (03)</option>
                    <option value="37">Otro (37)</option>
                  </select>
                </div>
                <div className="field">
                  <label>N° Documento</label>
                  <input {...register('receptor.numDocumento')} />
                </div>
                <div className="field">
                  <label>Correo</label>
                  <input type="email" {...register('receptor.correo')} />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input {...register('receptor.telefono')} />
                </div>
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
                    <div className="form-grid">
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
                          <option value={1}>1 - Bien</option>
                          <option value={2}>2 - Servicio</option>
                          <option value={3}>3 - Ambos</option>
                          <option value={4}>4 - Otro cargo</option>
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
                        <label>Precio unitario</label>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.precioUni`, { valueAsNumber: true })}
                          onChange={(e) => { setValue(`items.${index}.precioUni`, Number(e.target.value)); recalcular(index); }}
                        />
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
                      <div className="field">
                        <label>Venta exenta</label>
                        <input type="number" step="0.01" min="0"
                          {...register(`items.${index}.ventaExenta`, { valueAsNumber: true })}
                        />
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
                <div className="field">
                  <label>Observaciones</label>
                  <input {...register('observaciones')} placeholder="Opcional" />
                </div>
              </div>
            </div>
          </div>

          {/* Totales */}
          <div className="totales-bar">
            <div className="totales-item">
              <span className="totales-label">Gravado</span>
              <span className="totales-value">${totalGravada.toFixed(2)}</span>
            </div>
            {totalExenta > 0 && (
              <div className="totales-item">
                <span className="totales-label">Exento</span>
                <span className="totales-value">${totalExenta.toFixed(2)}</span>
              </div>
            )}
            <div className="totales-item">
              <span className="totales-label">IVA incluido</span>
              <span className="totales-value">${ivaIncluido.toFixed(2)}</span>
            </div>
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
              {mutation.isPending ? 'Emitiendo...' : '🧾 Emitir Factura CF'}
            </button>
          </div>
        </form>

        {pendingData && (
          <ConfirmEmitirModal
            titulo="Factura Consumidor Final"
            receptor={watch('receptor.nombre') || 'CONSUMIDOR FINAL'}
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
