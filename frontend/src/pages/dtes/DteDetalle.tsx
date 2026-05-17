import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { dteApi, type InvalidarPayload } from '../../api/dte.api';
import { EstadoBadge } from '../../components/EstadoBadge';
import { NuevaNotaModal } from '../notas/NuevaNotaModal';

export function DteDetalle() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAnular, setShowAnular] = useState(false);
  const [showNota, setShowNota] = useState<'nc' | 'nd' | null>(null);

  const { data: dte, isLoading, error } = useQuery({
    queryKey: ['dte', id],
    queryFn: () => dteApi.obtener(id!),
    enabled: !!id,
  });

  const consultarMutation = useMutation({
    mutationFn: () => dteApi.consultarMh(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dte', id] });
    },
  });

  const anularMutation = useMutation({
    mutationFn: (payload: InvalidarPayload) => dteApi.anular(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dte', id] });
      queryClient.invalidateQueries({ queryKey: ['dtes'] });
      setShowAnular(false);
    },
  });

  const anularForm = useForm<InvalidarPayload>({
    defaultValues: {
      tipoAnulacion: 1,
      motivoAnulacion: '',
      nombreResponsable: '',
      tipDocResponsable: '13',
      numDocResponsable: '',
      nombreSolicita: '',
      tipDocSolicita: '13',
      numDocSolicita: '',
    },
  });

  if (isLoading) return <div className="loading-wrap"><div className="spinner" /></div>;
  if (error || !dte) return (
    <div className="page" style={{ padding: 28 }}>
      <div className="alert alert-error">⚠️ DTE no encontrado</div>
    </div>
  );

  const json = dte.jsonDte as any;
  const esCcf = dte.tipoDte === '03';

  const TIPO_TITULOS: Record<string, string> = {
    '01': 'Factura — Consumidor Final',
    '03': 'Comprobante de Crédito Fiscal',
    '05': 'Nota de Crédito',
    '06': 'Nota de Débito',
    '04': 'Nota de Remisión',
    '07': 'Comprobante de Retención',
    '11': 'Factura de Exportación',
    '14': 'Factura Sujeto Excluido',
    '15': 'Comprobante de Donación',
  };
  const TIPO_PILLS: Record<string, string> = {
    '01': 'CF', '03': 'CCF', '05': 'NC', '06': 'ND', '04': 'NRE',
    '07': 'RETEN', '11': 'FEXE', '14': 'FSE', '15': 'DON',
  };

  const puedeAnular = dte.estado === 'RECIBIDO';
  const puedNota    = dte.estado === 'RECIBIDO' && esCcf;

  const descargarJson = () => {
    const contenido = JSON.stringify(dte.jsonDte ?? {}, null, 2);
    const blob = new Blob([contenido], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const nombreArchivo = `${dte.numeroControl ?? dte.id}.json`;
    a.href     = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ flex: 1 }}>
      <div className="topbar">
        <span className="topbar-title">
          {TIPO_TITULOS[dte.tipoDte] ?? `Tipo ${dte.tipoDte}`}
        </span>
        <div className="topbar-actions">
          <a
            href={dteApi.pdfUrl(id!)}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-primary"
          >
            ↓ PDF
          </a>
          <button className="btn btn-sm" onClick={descargarJson}>
            ↓ JSON
          </button>
          {(dte.estado === 'PENDIENTE' || dte.estado === 'CONTINGENCIA') && (
            <button
              className="btn btn-sm"
              onClick={() => consultarMutation.mutate()}
              disabled={consultarMutation.isPending}
            >
              {consultarMutation.isPending ? 'Consultando...' : '↻ Consultar MH'}
            </button>
          )}
          {puedNota && (
            <>
              <button className="btn btn-sm" onClick={() => setShowNota('nc')}>NC</button>
              <button className="btn btn-sm" onClick={() => setShowNota('nd')}>ND</button>
            </>
          )}
          {puedeAnular && (
            <button className="btn btn-sm btn-danger" onClick={() => setShowAnular(true)}>
              Anular
            </button>
          )}
          <Link to="/" className="btn btn-sm">← Volver</Link>
        </div>
      </div>

      <div className="page">
        <div className="detail-grid" style={{ marginBottom: 16 }}>
          {/* Identificación */}
          <div className="detail-card">
            <div className="detail-card-header">Identificación</div>
            <div className="detail-card-body">
              <dl>
                <div className="detail-row">
                  <dt>Tipo</dt>
                  <dd><span className="tipo-pill">{TIPO_PILLS[dte.tipoDte] ?? dte.tipoDte}</span></dd>
                </div>
                <div className="detail-row">
                  <dt>N° Control</dt>
                  <dd style={{ fontFamily: 'monospace', fontSize: '.78rem' }}>{dte.numeroControl}</dd>
                </div>
                <div className="detail-row">
                  <dt>Código generación</dt>
                  <dd style={{ fontFamily: 'monospace', fontSize: '.7rem' }}>{dte.codigoGeneracion}</dd>
                </div>
                <div className="detail-row">
                  <dt>Fecha emisión</dt>
                  <dd>{dte.fechaEmision}</dd>
                </div>
                <div className="detail-row">
                  <dt>Estado</dt>
                  <dd><EstadoBadge estado={dte.estado} /></dd>
                </div>
                {dte.selloRecepcion && (
                  <div className="detail-row">
                    <dt>Sello MH</dt>
                    <dd style={{ fontFamily: 'monospace', fontSize: '.72rem' }}>{dte.selloRecepcion}</dd>
                  </div>
                )}
                {dte.fhProcesamiento && (
                  <div className="detail-row">
                    <dt>Procesado</dt>
                    <dd>{dte.fhProcesamiento}</dd>
                  </div>
                )}
                {dte.observaciones && (
                  <div className="detail-row">
                    <dt>Observaciones</dt>
                    <dd style={{ color: 'var(--danger)' }}>{dte.observaciones}</dd>
                  </div>
                )}
                {dte.codigoMsg && (
                  <div className="detail-row">
                    <dt>Código MH</dt>
                    <dd><code>{dte.codigoMsg}</code> — {dte.descripcionMsg}</dd>
                  </div>
                )}
                {dte.clasificaMsg && (
                  <div className="detail-row">
                    <dt>Clasificación</dt>
                    <dd><span className={['10', 'DTE', 'CCF', 'FSE', 'ND', 'NC', 'NR', 'FEX', 'DON'].includes(dte.clasificaMsg ?? '') || dte.codigoMsg === '001' ? 'tipo-pill' : 'tipo-pill tipo-pill--danger'}>{['10', 'DTE', 'CCF', 'FSE', 'ND', 'NC', 'NR', 'FEX', 'DON'].includes(dte.clasificaMsg ?? '') || dte.codigoMsg === '001' ? 'Aceptado' : 'Error'}</span></dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Receptor — FSE usa sujetoExcluido, el resto usa receptor */}
          {(() => {
            const esFse = dte.tipoDte === '14';
            const rec = esFse ? json?.sujetoExcluido : json?.receptor;
            return (
              <div className="detail-card">
                <div className="detail-card-header">{esFse ? 'Sujeto Excluido' : 'Receptor'}</div>
                <div className="detail-card-body">
                  <dl>
                    <div className="detail-row">
                      <dt>Nombre</dt>
                      <dd>{dte.receptorNombre ?? rec?.nombre ?? 'Consumidor Final'}</dd>
                    </div>
                    {esFse && (
                      <>
                        {rec?.tipoDocumento && <div className="detail-row"><dt>Tipo doc.</dt><dd>{rec.tipoDocumento}</dd></div>}
                        {rec?.numDocumento && <div className="detail-row"><dt>Documento</dt><dd>{rec.numDocumento}</dd></div>}
                        {rec?.descActividad && <div className="detail-row"><dt>Actividad</dt><dd>{rec.descActividad}</dd></div>}
                        {rec?.direccion?.complemento && <div className="detail-row"><dt>Dirección</dt><dd>{rec.direccion.complemento}</dd></div>}
                      </>
                    )}
                    {(esCcf || dte.tipoDte === '04' || dte.tipoDte === '05' || dte.tipoDte === '06') && (
                      <>
                        {rec?.nit && <div className="detail-row"><dt>NIT</dt><dd>{rec.nit}</dd></div>}
                        {rec?.nrc && <div className="detail-row"><dt>NRC</dt><dd>{rec.nrc}</dd></div>}
                        {rec?.descActividad && <div className="detail-row"><dt>Actividad</dt><dd>{rec.descActividad}</dd></div>}
                        {rec?.direccion?.complemento && <div className="detail-row"><dt>Dirección</dt><dd>{rec.direccion.complemento}</dd></div>}
                      </>
                    )}
                    {dte.tipoDte === '11' && (
                      <>
                        {rec?.nombrePais && <div className="detail-row"><dt>País</dt><dd>{rec.nombrePais}</dd></div>}
                        {rec?.complemento && <div className="detail-row"><dt>Dirección</dt><dd>{rec.complemento}</dd></div>}
                        {rec?.numDocumento && <div className="detail-row"><dt>Documento</dt><dd>{rec.numDocumento}</dd></div>}
                      </>
                    )}
                    {rec?.correo && <div className="detail-row"><dt>Correo</dt><dd>{rec.correo}</dd></div>}
                    {rec?.telefono && <div className="detail-row"><dt>Teléfono</dt><dd>{rec.telefono}</dd></div>}
                  </dl>
                </div>
              </div>
            );
          })()}

          {/* Documento relacionado (NC / ND) */}
          {json?.documentoRelacionado?.length > 0 && (
            <div className="detail-card">
              <div className="detail-card-header">Documento relacionado</div>
              <div className="detail-card-body">
                {json.documentoRelacionado.map((dr: any, i: number) => (
                  <dl key={i}>
                    <div className="detail-row"><dt>Tipo doc.</dt><dd>{dr.tipoDocumento}</dd></div>
                    <div className="detail-row"><dt>Código generación</dt><dd style={{ fontFamily: 'monospace', fontSize: '.72rem' }}>{dr.numeroDocumento}</dd></div>
                    <div className="detail-row"><dt>Fecha emisión</dt><dd>{dr.fechaEmision}</dd></div>
                  </dl>
                ))}
              </div>
            </div>
          )}

          {/* Detalle items */}
          <div className="detail-card detail-full">
            <div className="detail-card-header">Detalle de items</div>
            <div className="detail-card-body" style={{ padding: 0 }}>
              {dte.tipoDte === '07' ? (
                /* Tabla específica para Retención (07) */
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Descripción</th>
                      <th>DTE origen</th>
                      <th>N° Documento</th>
                      <th>Cód. Retención</th>
                      <th>Monto sujeto</th>
                      <th>IVA Retenido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(json?.cuerpoDocumento ?? []).map((item: any) => (
                      <tr key={item.numItem}>
                        <td>{item.numItem}</td>
                        <td className="text-main">{item.descripcion}</td>
                        <td>{item.tipoDte}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '.72rem' }}>{item.numDocumento}</td>
                        <td>{item.codigoRetencionMH}</td>
                        <td>${Number(item.montoSujetoGrav ?? 0).toFixed(2)}</td>
                        <td>${Number(item.ivaRetenido ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                /* Tabla estándar para CF, CCF, NC, ND, NRE, FEXE, FSE, Donación */
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Descripción</th>
                      <th>Cantidad</th>
                      <th>Precio Unit.</th>
                      <th>Descuento</th>
                      <th>{dte.tipoDte === '14' ? 'Compra Afectada' : 'Venta Gravada'}</th>
                      <th>{dte.tipoDte === '14' ? 'Compra Exenta' : 'Venta Exenta'}</th>
                      {esCcf && <th>IVA</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(json?.cuerpoDocumento ?? []).map((item: any) => {
                      const gravada = dte.tipoDte === '14' ? item.compraAfectada : item.ventaGravada;
                      const exenta  = dte.tipoDte === '14' ? item.compraExenta   : item.ventaExenta;
                      return (
                        <tr key={item.numItem}>
                          <td>{item.numItem}</td>
                          <td className="text-main">{item.descripcion}</td>
                          <td>{item.cantidad}</td>
                          <td>${Number(item.precioUni ?? 0).toFixed(2)}</td>
                          <td>${Number(item.montoDescu ?? 0).toFixed(2)}</td>
                          <td>${Number(gravada ?? 0).toFixed(2)}</td>
                          <td>${Number(exenta ?? 0).toFixed(2)}</td>
                          {esCcf && <td>${(
                            Number(json?.resumen?.totalGravada) > 0
                              ? (Number(item.ventaGravada) / Number(json.resumen.totalGravada)) * Number(json?.resumen?.tributos?.[0]?.valor ?? Number(json.resumen.totalGravada) * 0.13)
                              : Number(item.ventaGravada) * 0.13
                          ).toFixed(2)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Totales */}
          <div className="detail-card" style={{ gridColumn: '2 / 3' }}>
            <div className="detail-card-header">Resumen financiero</div>
            <div className="detail-card-body">
              <dl>
                <div className="detail-row">
                  <dt>{dte.tipoDte === '14' ? 'Compra afectada' : 'Total gravado'}</dt>
                  <dd>${Number(
                    dte.tipoDte === '14'
                      ? (json?.resumen?.totalCompraAfecta ?? 0)
                      : (json?.resumen?.totalGravada ?? 0)
                  ).toFixed(2)}</dd>
                </div>
                {Number(dte.tipoDte === '14' ? json?.resumen?.totalCompraExenta : json?.resumen?.totalExenta) > 0 && (
                  <div className="detail-row">
                    <dt>{dte.tipoDte === '14' ? 'Compra exenta' : 'Total exento'}</dt>
                    <dd>${Number(dte.tipoDte === '14' ? json?.resumen?.totalCompraExenta : json?.resumen?.totalExenta).toFixed(2)}</dd>
                  </div>
                )}
                {Number(json?.resumen?.totalDescu) > 0 && (
                  <div className="detail-row">
                    <dt>Descuento</dt>
                    <dd>-${Number(json.resumen.totalDescu).toFixed(2)}</dd>
                  </div>
                )}
                {esCcf && (
                  <div className="detail-row">
                    <dt>IVA (13%)</dt>
                    <dd>${Number(json?.resumen?.tributos?.[0]?.valor ?? (Number(json?.resumen?.totalGravada ?? 0) * 0.13)).toFixed(2)}</dd>
                  </div>
                )}
                <div className="detail-row total-row">
                  <dt>Total a pagar</dt>
                  <dd>${Number(json?.resumen?.totalPagar ?? dte.totalPagar).toFixed(2)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Nota de Crédito / Débito */}
      {showNota && (
        <NuevaNotaModal
          dteId={id!}
          tipoDte={showNota}
          onClose={() => setShowNota(null)}
        />
      )}

      {/* Modal de anulación */}
      {showAnular && (
        <div className="modal-overlay" onClick={() => setShowAnular(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Anular DTE</span>
              <button className="modal-close" onClick={() => setShowAnular(false)}>×</button>
            </div>
            <form
              className="modal-body"
              onSubmit={anularForm.handleSubmit((data) => anularMutation.mutate(data))}
            >
              {anularMutation.isError && (
                <div className="alert alert-error" style={{ marginBottom: 12 }}>
                  {(anularMutation.error as Error).message}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Tipo de anulación</label>
                <select className="form-control" {...anularForm.register('tipoAnulacion', { valueAsNumber: true })}>
                  <option value={1}>1 — Error en contenido del documento</option>
                  <option value={2}>2 — Error en receptor del documento</option>
                  <option value={3}>3 — No se efectuó la operación</option>
                  <option value={4}>4 — Otros</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Motivo de anulación</label>
                <textarea
                  className="form-control"
                  rows={2}
                  {...anularForm.register('motivoAnulacion', { required: true })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre responsable</label>
                  <input className="form-control" {...anularForm.register('nombreResponsable', { required: true })} />
                </div>
                <div className="form-group" style={{ maxWidth: 90 }}>
                  <label className="form-label">Tipo doc</label>
                  <select className="form-control" {...anularForm.register('tipDocResponsable')}>
                    <option value="13">DUI</option>
                    <option value="36">NIT</option>
                    <option value="02">Pasaporte</option>
                    <option value="03">Carné residente</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">N° documento</label>
                  <input className="form-control" {...anularForm.register('numDocResponsable', { required: true })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre solicitante</label>
                  <input className="form-control" {...anularForm.register('nombreSolicita', { required: true })} />
                </div>
                <div className="form-group" style={{ maxWidth: 90 }}>
                  <label className="form-label">Tipo doc</label>
                  <select className="form-control" {...anularForm.register('tipDocSolicita')}>
                    <option value="13">DUI</option>
                    <option value="36">NIT</option>
                    <option value="02">Pasaporte</option>
                    <option value="03">Carné residente</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">N° documento</label>
                  <input className="form-control" {...anularForm.register('numDocSolicita', { required: true })} />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-sm" onClick={() => setShowAnular(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-danger"
                  disabled={anularMutation.isPending}
                >
                  {anularMutation.isPending ? 'Anulando...' : 'Confirmar anulación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
