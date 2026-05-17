import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';
import { ConfirmEmitirModal } from '../../components/ConfirmEmitirModal';
import { useToast } from '../../context/ToastContext';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';
import { PAISES } from '../../catalogs/paises';
import { useGuardarCliente } from '../../hooks/useGuardarCliente';
import { GuardarClienteModal } from '../../components/GuardarClienteModal';

import { ClienteSelect, type Cliente } from '../../components/ClienteSelect';
import { ProductoSelect, type Producto } from '../../components/ProductoSelect';

import apiClient from '../../api/apiClient';
const api = apiClient;

interface ItemFexe {
  numItem: number; tipoItem: number; cantidad: number; uniMedida: number;
  descripcion: string; precioUni: number; montoDescu: number; ventaGravada: number;
}
interface FexeForm {
  receptor: {
    nombre: string; codPais: string; nombrePais: string;
    complemento?: string; correo?: string; telefono?: string;
    numDocumento?: string; tipoDocumento?: string;
  };
  items: ItemFexe[];
  condicionOperacion: number;
  tipoExportacion: number;
  observaciones?: string;
}

const itemVacio: ItemFexe = {
  numItem: 1, tipoItem: 1, cantidad: 1, uniMedida: 59,
  descripcion: '', precioUni: 0, montoDescu: 0, ventaGravada: 0,
};

export function NuevaFexe() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pendingData, setPendingData] = useState<FexeForm | null>(null);
  const { marcarDelCatalogo, checkGuardarCliente, clienteNuevoModal, setClienteNuevoModal, marcarGuardado } = useGuardarCliente();
  const { register, control, handleSubmit, watch, setValue } = useForm<FexeForm>({
    defaultValues: {
      condicionOperacion: 1,
      tipoExportacion: 1,
      receptor: { codPais: 'US', nombrePais: 'Estados Unidos' },
      items: [{ ...itemVacio }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const mutation = useMutation({
    mutationFn: (data: FexeForm) => api.post('/dte/fexe', data).then(r => r.data),
    onSuccess: (dte) => {
      handleDteEmitido(dte, toast, 'Factura de Exportación');
      navigate(`/dte/${dte.id}`);
    },
    onError: (err: unknown) => {
      setPendingData(null);
      toast.error('Error al emitir FEXE', parseApiError(err)[0]);
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
  const totalDescu   = items.reduce((s, i) => s + (Number(i.montoDescu) || 0), 0);
  const totalPagar   = totalGravada - totalDescu;

  const handlePaisChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pais = PAISES.find(p => p.codigo === e.target.value);
    setValue('receptor.codPais', e.target.value);
    setValue('receptor.nombrePais', pais?.nombre ?? '');
  };

  const onClienteSelect = (c: Cliente) => {
    setValue('receptor.nombre', c.nombre);
    setValue('receptor.correo', c.correo || '');
    setValue('receptor.telefono', c.telefono || '');
    setValue('receptor.numDocumento', c.numDocumento || '');
    setValue('receptor.tipoDocumento', c.tipoDocumento || '');
    setValue('receptor.complemento', c.direccionComplemento || '');
    // Support new country fields
    if (c.codPais) {
      setValue('receptor.codPais', c.codPais);
      const pais = PAISES.find(p => p.codigo === c.codPais);
      setValue('receptor.nombrePais', pais?.nombre || c.nombrePais || '');
    }
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
        <span className="topbar-title">Nueva Factura de Exportación (FEXE)</span>
        <div className="topbar-actions">
          <button className="btn btn-sm" onClick={() => navigate('/')}>Cancelar</button>
        </div>
      </div>

      <div className="page">
        <form onSubmit={handleSubmit((data) => {
          checkGuardarCliente(data.receptor ?? {});
          setPendingData(data);
        })}>

          {/* Receptor extranjero */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title"><span className="section-icon">🌍</span>Receptor (comprador extranjero) *</span>
            </div>
            <div className="form-section-body">
              <ClienteSelect onSelect={onClienteSelect} />
              <div className="form-grid">
                <div className="field field-full">
                  <label>Nombre / Razón social *</label>
                  <input {...register('receptor.nombre', { required: true })} placeholder="Nombre del cliente extranjero" />
                </div>
                <div className="field">
                  <label>País destino *</label>
                  <select
                    value={watch('receptor.codPais')}
                    onChange={handlePaisChange}
                  >
                    {PAISES.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Tipo de exportación</label>
                  <select {...register('tipoExportacion', { valueAsNumber: true })}>
                    <option value={1}>1 — Bienes</option>
                    <option value={2}>2 — Servicios</option>
                    <option value={3}>3 — Ambos</option>
                  </select>
                </div>
                <div className="field">
                  <label>Tipo documento receptor</label>
                  <select {...register('receptor.tipoDocumento')}>
                    <option value="">Sin documento</option>
                    <option value="01">Pasaporte</option>
                    <option value="02">ID extranjero</option>
                    <option value="36">NIT</option>
                  </select>
                </div>
                <div className="field">
                  <label>N° documento</label>
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
                <div className="field field-full">
                  <label>Dirección en país destino</label>
                  <input {...register('receptor.complemento')} placeholder="Ciudad, estado, dirección" />
                </div>
              </div>
            </div>
          </div>

          {/* Detalle */}
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-title"><span className="section-icon">📦</span>Detalle de exportación</span>
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
                        <label>Precio unitario (USD)</label>
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
                        <span className="field-hint">Calculado</span>
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
              <span className="form-section-title"><span className="section-icon">💳</span>Condiciones de pago</span>
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
                  <label>Observaciones</label>
                  <input {...register('observaciones')} placeholder="Opcional" />
                </div>
              </div>
            </div>
          </div>

          <div className="totales-bar">
            <div className="totales-item">
              <span className="totales-label">Total exportación</span>
              <span className="totales-value">${totalGravada.toFixed(2)}</span>
            </div>
            {totalDescu > 0 && (
              <div className="totales-item">
                <span className="totales-label">Descuentos</span>
                <span className="totales-value">-${totalDescu.toFixed(2)}</span>
              </div>
            )}
            <div className="totales-item totales-total">
              <span className="totales-label">Total a cobrar (0% IVA)</span>
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
              {mutation.isPending ? 'Emitiendo...' : '🌍 Emitir Factura de Exportación'}
            </button>
          </div>
        </form>

        {pendingData && (
          <ConfirmEmitirModal
            titulo="Factura de Exportación"
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
