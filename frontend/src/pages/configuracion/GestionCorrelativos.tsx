import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';

const TIPOS_DTE = [
  { codigo: '01', nombre: 'Factura CF' },
  { codigo: '03', nombre: 'Crédito Fiscal' },
  { codigo: '05', nombre: 'Nota de Crédito' },
  { codigo: '06', nombre: 'Nota de Débito' },
  { codigo: '07', nombre: 'Comprobante de Retención' },
  { codigo: '08', nombre: 'Comprobante de Liquidación' },
  { codigo: '09', nombre: 'Documento Contable de Liquidación' },
  { codigo: '11', nombre: 'Facturas de Exportación' },
  { codigo: '14', nombre: 'Factura de Sujeto Excluido' },
  { codigo: '15', nombre: 'Comprobante de Donación' },
];

export function GestionCorrelativos() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    tipoDte: '01',
    sucursal: 'M001',
    pos: 'P001',
    ultimoNumero: 0,
    anio: new Date().getFullYear(),
  });

  const { data: empresa } = useQuery({
    queryKey: ['empresa'],
    queryFn: () => apiClient.get('/empresa').then(r => r.data),
  });

  const { data: correlativos = [], isLoading } = useQuery({
    queryKey: ['correlativos'],
    queryFn: () => apiClient.get('/correlativos').then(r => r.data),
  });

  const ambienteActual = empresa?.mhAmbiente ?? '00';
  const correlativosFiltrados = correlativos.filter((c: any) => c.ambiente === ambienteActual);

  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/correlativos/inicializar', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['correlativos'] });
      setModal(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">⚙️ Gestión de Correlativos</span>
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>
          + Inicializar Secuencia
        </button>
      </div>

      <div style={{ padding: '20px 28px' }}>
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <strong>💡 Normativa:</strong> Los correlativos se reinician automáticamente cada 1 de enero. 
          Use esta herramienta para establecer el número inicial si está migrando desde otro emisor.
        </div>

        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Tipo DTE</th>
                <th>Año</th>
                <th>Sucursal/POS</th>
                <th>Último Número</th>
                <th>Siguiente Sugerido</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>Cargando...</td></tr>
              ) : correlativosFiltrados.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>No hay secuencias registradas aún.</td></tr>
              ) : (
                correlativosFiltrados.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{TIPOS_DTE.find(t => t.codigo === c.tipoDte)?.nombre || c.tipoDte}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Código: {c.tipoDte}</div>
                    </td>
                    <td><span className="badge">{c.anio}</span></td>
                    <td>{c.sucursal} / {c.pos}</td>
                    <td style={{ fontWeight: 700, fontSize: 16 }}>{c.ultimoNumero}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>{Number(c.ultimoNumero) + 1}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth: 450 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Inicializar Secuencia</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tipo de Documento</label>
                  <select 
                    className="form-control" 
                    value={form.tipoDte} 
                    onChange={e => setForm({...form, tipoDte: e.target.value})}
                  >
                    {TIPOS_DTE.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Año Fiscal</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={form.anio} 
                      onChange={e => setForm({...form, anio: Number(e.target.value)})} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Último número emitido</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={form.ultimoNumero} 
                      onChange={e => setForm({...form, ultimoNumero: Number(e.target.value)})} 
                    />
                    <small style={{ color: 'var(--text-3)' }}>El sistema usará el siguiente (+1)</small>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Cod. Establecimiento</label>
                    <input 
                      className="form-control" 
                      value={form.sucursal} 
                      onChange={e => setForm({...form, sucursal: e.target.value})} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cod. Punto Venta</label>
                    <input 
                      className="form-control" 
                      value={form.pos} 
                      onChange={e => setForm({...form, pos: e.target.value})} 
                    />
                  </div>
                </div>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Guardando...' : 'Guardar Secuencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
