import { useState, useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { UNIDADES_MEDIDA } from '../../catalogs/unidades';
import { parseApiError } from '../../utils/parseApiError';
import { handleDteEmitido } from '../../utils/dte-result';
import { useToast } from '../../context/ToastContext';

interface ItemNota {
  numItem: number;
  tipoItem: number;
  cantidad: number;
  uniMedida: number;
  descripcion: string;
  precioUni: number;
  montoDescu: number;
  ventaNoSuj: number;
  ventaExenta: number;
  ventaGravada: number;
}

interface NotaPayload {
  dteReferenciadoId: string;
  tipoAjuste: number;
  motivoAjuste: string;
  items: ItemNota[];
  observaciones?: string;
}

interface Props {
  dteId: string;
  tipoDte: 'nc' | 'nd';
  onClose: () => void;
}

const itemVacio: ItemNota = {
  numItem: 1, tipoItem: 1, cantidad: 1, uniMedida: 59,
  descripcion: '', precioUni: 0, montoDescu: 0,
  ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 0,
};

import apiClient from '../../api/apiClient';
const api = apiClient;

const MOTIVOS_NC = [
  { value: 1, label: '1 — Descuento' },
  { value: 2, label: '2 — Anulación parcial' },
  { value: 3, label: '3 — Devolución de mercancía' },
  { value: 4, label: '4 — Descuento condicional' },
  { value: 5, label: '5 — Corrección en montos' },
  { value: 6, label: '6 — Otro' },
];

const MOTIVOS_ND = [
  { value: 1, label: '1 — Cargo adicional' },
  { value: 2, label: '2 — Diferencia de precio' },
  { value: 3, label: '3 — Otro' },
];

export function NuevaNotaModal({ dteId, tipoDte, onClose }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const esNC = tipoDte === 'nc';
  const motivos = esNC ? MOTIVOS_NC : MOTIVOS_ND;
  const [pendingData, setPendingData] = useState<NotaPayload | null>(null);

  // Cargar datos del DTE referenciado para mostrar info al usuario
  const { data: dteRef } = useQuery({
    queryKey: ['dte', dteId],
    queryFn: () => api.get(`/dte/${dteId}`).then(r => r.data),
  });

  const { register, control, handleSubmit, watch, setValue } = useForm<NotaPayload>({
    defaultValues: {
      dteReferenciadoId: dteId,
      tipoAjuste: 1,
      motivoAjuste: '',
      items: [{ ...itemVacio }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' });
  const items = watch('items');

  // Pre-llenar ítems desde el DTE referenciado cuando cargue
  useEffect(() => {
    if (!dteRef?.jsonDte) return;
    const cuerpo: any[] = dteRef.jsonDte.cuerpoDocumento ?? [];
    if (cuerpo.length === 0) return;

    const itemsPreLlenados: ItemNota[] = cuerpo.map((it: any, i: number) => ({
      numItem:      i + 1,
      tipoItem:     Number(it.tipoItem ?? 1),
      cantidad:     Number(it.cantidad ?? 1),
      uniMedida:    Number(it.uniMedida ?? 59),
      descripcion:  it.descripcion ?? '',
      precioUni:    Number(it.precioUni ?? 0),
      montoDescu:   Number(it.montoDescu ?? 0),
      ventaNoSuj:   Number(it.noSuj ?? it.ventaNoSuj ?? 0),
      ventaExenta:  Number(it.ventaExenta ?? 0),
      ventaGravada: Number(it.ventaGravada ?? 0),
    }));

    replace(itemsPreLlenados);
  }, [dteRef]);

  const recalcular = (index: number) => {
    const item = items[index];
    if (!item) return;
    const gravada = Math.round((Number(item.cantidad) * Number(item.precioUni) - Number(item.montoDescu)) * 100) / 100;
    setValue(`items.${index}.ventaGravada`, gravada < 0 ? 0 : gravada);
  };

  const totalGravada = items.reduce((s, i) => s + (Number(i.ventaGravada) || 0), 0);
  const totalExenta  = items.reduce((s, i) => s + (Number(i.ventaExenta) || 0), 0);
  const totalNoSuj   = items.reduce((s, i) => s + (Number(i.ventaNoSuj) || 0), 0);
  const totalDescu   = items.reduce((s, i) => s + (Number(i.montoDescu) || 0), 0);
  const ivaTotal     = Math.round(totalGravada * 0.13 * 100) / 100;
  const totalPagar   = totalGravada + totalExenta + totalNoSuj - totalDescu + ivaTotal;

  const mutation = useMutation({
    mutationFn: (payload: NotaPayload) =>
      api.post(`/dte/${tipoDte}`, payload).then((r) => r.data),
    onSuccess: (dte) => {
      queryClient.invalidateQueries({ queryKey: ['dtes'] });
      handleDteEmitido(dte, toast, esNC ? 'Nota de Crédito' : 'Nota de Débito');
      onClose();
      navigate(`/dte/${dte.id}`);
    },
    onError: (err: unknown) => {
      setPendingData(null);
      toast.error(
        esNC ? 'Error al emitir NC' : 'Error al emitir ND',
        parseApiError(err)[0],
      );
    },
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 'min(800px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 40px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">
            {esNC ? 'Nueva Nota de Crédito (05)' : 'Nueva Nota de Débito (06)'}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit(setPendingData)}>
          <div className="modal-body">
            {/* Referencia al DTE original */}
            {dteRef && (
              <div style={{
                background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px',
                marginBottom: 16, fontSize: '.85rem', display: 'flex', gap: 16, flexWrap: 'wrap',
              }}>
                <span>📄 <strong>{dteRef.numeroControl}</strong></span>
                <span>👤 {dteRef.receptorNombre || 'Consumidor Final'}</span>
                <span>💰 ${Number(dteRef.totalPagar).toFixed(2)}</span>
                <span>📅 {dteRef.fechaEmision}</span>
              </div>
            )}

            {mutation.isError && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                {parseApiError(mutation.error).map((e, i) => <div key={i}>⚠️ {e}</div>)}
              </div>
            )}

            <div className="form-row" style={{ marginBottom: 16 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Tipo de ajuste</label>
                <select className="form-control" {...register('tipoAjuste', { valueAsNumber: true })}>
                  {motivos.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Motivo del ajuste</label>
                <input
                  className="form-control"
                  {...register('motivoAjuste', { required: true })}
                  placeholder="Descripción del ajuste"
                />
              </div>
            </div>

            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '.875rem' }}>Ítems del ajuste</strong>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => append({ ...itemVacio, numItem: fields.length + 1 })}
              >
                + Agregar ítem
              </button>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="item-row">
                <div className="item-row-num">{index + 1}</div>
                <div className="item-fields">
                  <div className="form-grid">
                    <div className="field field-full">
                      <label>Descripción *</label>
                      <input
                        className="form-control"
                        {...register(`items.${index}.descripcion`, { required: true })}
                        placeholder="Descripción del ajuste"
                      />
                    </div>
                    <div className="field">
                      <label>Tipo ítem</label>
                      <select className="form-control" {...register(`items.${index}.tipoItem`, { valueAsNumber: true })}>
                        <option value={1}>Bien</option>
                        <option value={2}>Servicio</option>
                        <option value={3}>Ambos</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Unidad de medida</label>
                      <select className="form-control" {...register(`items.${index}.uniMedida`, { valueAsNumber: true })}>
                        {UNIDADES_MEDIDA.map(u => (
                          <option key={u.codigo} value={u.codigo}>{u.descripcion}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Cantidad</label>
                      <input type="number" step="0.01" min="0" className="form-control"
                        {...register(`items.${index}.cantidad`, { valueAsNumber: true })}
                        onChange={(e) => { setValue(`items.${index}.cantidad`, Number(e.target.value)); recalcular(index); }}
                      />
                    </div>
                    <div className="field">
                      <label>Precio unitario</label>
                      <input type="number" step="0.01" min="0" className="form-control"
                        {...register(`items.${index}.precioUni`, { valueAsNumber: true })}
                        onChange={(e) => { setValue(`items.${index}.precioUni`, Number(e.target.value)); recalcular(index); }}
                      />
                    </div>
                    <div className="field">
                      <label>Descuento</label>
                      <input type="number" step="0.01" min="0" className="form-control"
                        {...register(`items.${index}.montoDescu`, { valueAsNumber: true })}
                        onChange={(e) => { setValue(`items.${index}.montoDescu`, Number(e.target.value)); recalcular(index); }}
                      />
                    </div>
                    <div className="field">
                      <label>Venta gravada</label>
                      <input type="number" step="0.01" readOnly className="form-control"
                        {...register(`items.${index}.ventaGravada`, { valueAsNumber: true })}
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

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Observaciones</label>
              <input className="form-control" {...register('observaciones')} placeholder="Opcional" />
            </div>

            {/* Totales */}
            <div className="totales-bar" style={{ marginTop: 16, borderRadius: 8 }}>
              <div className="totales-item">
                <span className="totales-label">Gravado</span>
                <span className="totales-value">${totalGravada.toFixed(2)}</span>
              </div>
              <div className="totales-item">
                <span className="totales-label">IVA (13%)</span>
                <span className="totales-value">${ivaTotal.toFixed(2)}</span>
              </div>
              <div className="totales-item totales-total">
                <span className="totales-label">Total ajuste</span>
                <span className="totales-value">${totalPagar.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Emitiendo...' : `Emitir ${esNC ? 'Nota de Crédito' : 'Nota de Débito'}`}
            </button>
          </div>
        </form>

        {/* Modal de confirmación */}
        {pendingData && (
          <div className="modal-overlay" onClick={() => setPendingData(null)}>
            <div className="modal" style={{ width: 'min(420px, calc(100vw - 32px))' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Confirmar emisión</span>
                <button className="modal-close" type="button" onClick={() => setPendingData(null)}>×</button>
              </div>
              <div className="modal-body" style={{ padding: '20px 24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 36 }}>📄</div>
                <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: '.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-3)' }}>Documento</span>
                    <span style={{ fontWeight: 600 }}>{esNC ? 'Nota de Crédito' : 'Nota de Débito'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-3)' }}>Receptor</span>
                    <span style={{ fontWeight: 500 }}>{dteRef?.receptorNombre || 'Consumidor Final'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>Total ajuste</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>${totalPagar.toFixed(2)}</span>
                  </div>
                </div>
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', fontSize: '.8rem', color: '#92400e' }}>
                  ⚠️ Una vez emitido, este DTE será enviado a Hacienda y <strong>no podrá modificarse</strong>.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-sm" onClick={() => setPendingData(null)} disabled={mutation.isPending}>Cancelar</button>
                <button
                  type="button" className="btn btn-sm btn-primary" disabled={mutation.isPending}
                  onClick={() => { mutation.mutate(pendingData); }}
                >
                  {mutation.isPending ? 'Emitiendo...' : '✅ Confirmar y emitir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
