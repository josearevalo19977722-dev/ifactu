import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ConfirmEmitirModal } from '../../components/ConfirmEmitirModal';
import { useToast } from '../../context/ToastContext';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';
import { DireccionFields } from '../../components/DireccionFields';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';
import { ActividadSelect } from '../../components/ActividadSelect';
import { TIPOS_ESTABLECIMIENTO } from '../../catalogs/tiposEstablecimiento';
import { useGuardarCliente } from '../../hooks/useGuardarCliente';
import { GuardarClienteModal } from '../../components/GuardarClienteModal';

import { ClienteSelect, type Cliente } from '../../components/ClienteSelect';
import { ProductoSelect, type Producto } from '../../components/ProductoSelect';

import apiClient from '../../api/apiClient';
const api = apiClient;

interface ItemDonacion {
  numItem: number;
  tipoDonacion: number;
  cantidad: number;
  codigo?: string;
  uniMedida: number;
  descripcion: string;
  valorUni: number;
  montoDescu: number;
  depreciacion: number;
  valor: number;
}

interface DonacionForm {
  numResolucion?: string;
  descripcionResolucion?: string;
  donatario: {
    tipoDocumento: string;
    numDocumento: string;
    nrc?: string;
    nombre: string;
    nombreComercial?: string;
    codActividad?: string;
    descActividad?: string;
    tipoEstablecimiento: string;
    codEstableMH: string;
    codPuntoVentaMH: string;
    direccionDepartamento: string;
    direccionMunicipio: string;
    direccionComplemento: string;
    telefono?: string;
    correo?: string;
  };
  items: ItemDonacion[];
  observaciones?: string;
}

const itemVacio: ItemDonacion = {
  numItem: 1, tipoDonacion: 1, cantidad: 1, uniMedida: 99,
  descripcion: '', valorUni: 0, montoDescu: 0, depreciacion: 0, valor: 0,
};

export function NuevaDonacion() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pendingData, setPendingData] = useState<DonacionForm | null>(null);
  const { marcarDelCatalogo, checkGuardarCliente, clienteNuevoModal, setClienteNuevoModal, marcarGuardado } = useGuardarCliente();
  const { register, control, handleSubmit, watch, setValue, getValues } = useForm<DonacionForm>({
    defaultValues: {
      donatario: {
        tipoDocumento: '36', tipoEstablecimiento: '02',
        codEstableMH: '0001', codPuntoVentaMH: 'P001',
        codActividad: '', descActividad: '',
        nrc: '', nombre: '', direccionDepartamento: '',
        direccionMunicipio: '', direccionComplemento: '',
      },
      items: [{ ...itemVacio }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const mutation = useMutation({
    mutationFn: (data: DonacionForm) => api.post('/dte/donacion', data).then(r => r.data),
    onSuccess: (dte) => {
      handleDteEmitido(dte, toast, 'Comprobante de Donación');
      navigate(`/dte/${dte.id}`);
    },
    onError: (err: unknown) => {
      setPendingData(null);
      toast.error('Error al emitir Donación', parseApiError(err)[0]);
    },
  });

  const items = watch('items');
  const valorTotal = items.reduce((s, i) => s + (Number(i.valor) || 0), 0);

  const recalcular = (index: number) => {
    const item = items[index];
    if (!item) return;
    // montoDescu no aplica en tipo 15; solo valorUni × cantidad − depreciacion
    const total = (Number(item.valorUni) || 0) * (Number(item.cantidad) || 0)
      - (Number(item.depreciacion) || 0);
    setValue(`items.${index}.valor`, +Math.max(0, total).toFixed(2));
  };

  const onClienteSelect = (c: Cliente) => {
    setValue('donatario.nombre',               c.nombre);
    setValue('donatario.numDocumento',         c.numDocumento || c.nit || '');
    setValue('donatario.tipoDocumento',        c.tipoDocumento || '36');
    setValue('donatario.nrc',                  c.nrc || '');
    setValue('donatario.correo',               c.correo || '');
    setValue('donatario.telefono',             c.telefono || '');
    setValue('donatario.codActividad',         c.codActividad || '');
    setValue('donatario.descActividad',        c.descActividad || '');
    setValue('donatario.direccionDepartamento',c.direccionDepartamento || '');
    setValue('donatario.direccionMunicipio',   c.direccionMunicipio || '');
    setValue('donatario.direccionComplemento', c.direccionComplemento || '');
    marcarDelCatalogo();
  };

  const onProductoSelect = (index: number, p: Producto) => {
    setValue(`items.${index}.descripcion`, p.nombre);
    if (p.precioVenta) {
      setValue(`items.${index}.valorUni`, Number(p.precioVenta));
    }
    if (p.uniMedidaMh) setValue(`items.${index}.uniMedida`, p.uniMedidaMh);
    if (p.codigo) setValue(`items.${index}.codigo`, p.codigo);
    recalcular(index);
  };

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">Nuevo Comprobante de Donación (15)</span>
      </div>

      <div style={{ padding: '20px 28px', maxWidth: 960 }}>
        <form onSubmit={handleSubmit((data) => {
          checkGuardarCliente(data.donatario ?? {});
          setPendingData(data);
        })}>

          {/* Donatario */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header"><span className="table-title">Donatario (Entidad Receptora)</span></div>
            <div style={{ padding: '16px 20px' }}>
              <ClienteSelect onSelect={onClienteSelect} />

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tipo documento *</label>
                  <select className="form-control" {...register('donatario.tipoDocumento', { required: true })}>
                    <option value="13">13 - DUI</option>
                    <option value="36">36 - NIT</option>
                    <option value="02">02 - Pasaporte</option>
                    <option value="03">03 - Carné de residente</option>
                    <option value="37">37 - Otro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">N° documento *</label>
                  <input className="form-control" {...register('donatario.numDocumento', { required: true })} />
                </div>
                <div className="form-group">
                  <label className="form-label">NRC *</label>
                  <input className="form-control" placeholder="000000-0" {...register('donatario.nrc', { required: true })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nombre / Razón Social *</label>
                  <input className="form-control" {...register('donatario.nombre', { required: true })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre comercial</label>
                  <input className="form-control" {...register('donatario.nombreComercial')} />
                </div>
              </div>

              <ActividadSelect
                fieldCodigo="donatario.codActividad"
                fieldDescripcion="donatario.descActividad"
                register={register}
                setValue={setValue}
                watch={watch}
              />

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tipo establecimiento *</label>
                  <select className="form-control" {...register('donatario.tipoEstablecimiento', { required: true })}>
                    {TIPOS_ESTABLECIMIENTO.map((te) => (
                      <option key={te.codigo} value={te.codigo}>{te.codigo} - {te.descripcion}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Cód. Estable MH *</label>
                  <input className="form-control" placeholder="0001" {...register('donatario.codEstableMH', { required: true })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cód. Punto Venta MH *</label>
                  <input className="form-control" placeholder="P001" {...register('donatario.codPuntoVentaMH', { required: true })} />
                </div>
              </div>

              <DireccionFields
                fieldDepartamento="donatario.direccionDepartamento"
                fieldMunicipio="donatario.direccionMunicipio"
                fieldComplemento="donatario.direccionComplemento"
                register={register}
                setValue={setValue}
                getValues={getValues}
              />

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-control" {...register('donatario.telefono')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Correo</label>
                  <input className="form-control" type="email" {...register('donatario.correo')} />
                </div>
              </div>
            </div>
          </div>

          {/* Items donados */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div className="table-header">
              <span className="table-title">Bienes / Servicios Donados</span>
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
                      <label className="form-label">Tipo donación *</label>
                      <select className="form-control" {...register(`items.${idx}.tipoDonacion`, { valueAsNumber: true })}>
                        <option value={1}>1 - Dineraria (efectivo)</option>
                        <option value={2}>2 - No dineraria (especie)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Código</label>
                      <input className="form-control" {...register(`items.${idx}.codigo`)} />
                    </div>
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
                      <ProductoSelect onSelect={(p) => onProductoSelect(idx, p)} />
                      <input style={{ marginTop: 8 }} className="form-control"
                        {...register(`items.${idx}.descripcion`, { required: true })} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Valor unitario *</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.valorUni`, { valueAsNumber: true })}
                        onBlur={() => recalcular(idx)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cantidad *</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.cantidad`, { valueAsNumber: true })}
                        onBlur={() => recalcular(idx)} />
                    </div>
                    {/* montoDescu no está permitido en tipo 15 — solo depreciación */}
                    <div className="form-group">
                      <label className="form-label">Depreciación</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.depreciacion`, { valueAsNumber: true })}
                        onBlur={() => recalcular(idx)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Valor total *</label>
                      <input className="form-control" type="number" step="0.01" min="0"
                        {...register(`items.${idx}.valor`, { valueAsNumber: true, required: true })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resolución MH + Totales */}
          <div className="table-card" style={{ marginBottom: 20 }}>
            <div style={{ padding: '16px 20px' }}>

              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>📋 Resolución de Hacienda</div>
                <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 10 }}>
                  Número de resolución MH que autoriza al donatario a recibir donaciones deducibles (requerido por Hacienda).
                </small>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">N° Resolución MH</label>
                    <input className="form-control" placeholder="Ej: 40200-NEX-00198-2023"
                      {...register('numResolucion')} />
                  </div>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">Descripción</label>
                    <input className="form-control"
                      placeholder="Resolución de autorización para recibir donaciones deducibles"
                      {...register('descripcionResolucion')} />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea className="form-control" rows={2} {...register('observaciones')} />
              </div>

              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 16, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
                  <span>Total donado:</span><span>${valorTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {mutation.isError && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {parseApiError(mutation.error).map((e, i) => <div key={i}>⚠️ {e}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Emitiendo...' : '📋 Emitir Comprobante de Donación'}
            </button>
            <button type="button" className="btn" onClick={() => navigate(-1)}>Cancelar</button>
          </div>
        </form>

        {pendingData && (
          <ConfirmEmitirModal
            titulo="Comprobante de Donación"
            receptor={watch('donatario.nombre') || ''}
            total={valorTotal}
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
