import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE } from '../../api/apiClient';

export function ConsultaPublicaPage() {
  const { id } = useParams();

  const { data: dte, isLoading, error } = useQuery({
    queryKey: ['public-dte', id],
    queryFn: () => axios.get(`${API_BASE}/public/dte/${id}`).then(r => r.data),
    retry: false,
  });

  if (isLoading) return <div className="loading-fullscreen"><div className="spinner" /></div>;

  if (error || !dte) {
    return (
      <div className="public-portal-error">
        <div className="error-card">
          <h1>❌ Documento no encontrado</h1>
          <p>Lo sentimos, no pudimos encontrar el documento solicitado. Por favor verifique el código e intente de nuevo.</p>
        </div>
      </div>
    );
  }

  const json = dte.jsonDte as any;
  const emisor = json.emisor;
  const receptor = json.receptor;
  const items = json.cuerpoDocumento || [];
  const resumen = json.resumen || {};

  return (
    <div className="public-portal">
      <header className="public-header">
        <div className="container shadow-sm">
          <div className="header-content">
            <span className="portal-logo">🧾</span>
            <div className="header-text">
              <h1>Consultas DTE</h1>
              <p>Portal de Verificación de Documentos Tributarios Electrónicos</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container main-content">
        <div className="document-card shadow">
          {/* Header del Documento */}
          <div className="doc-header">
            <div className="emisor-brand">
              <h2 className="text-primary">{emisor.nombre}</h2>
              <p className="subtitle">{emisor.nombreComercial}</p>
              <div className="emisor-info">
                <span><strong>NIT:</strong> {emisor.nit}</span>
                <span><strong>NRC:</strong> {emisor.nrc}</span>
              </div>
            </div>
            <div className="doc-metadata">
              <div className="status-badge" style={{ 
                background: dte.estado === 'RECIBIDO' ? '#dcfce7' : '#fee2e2',
                color: dte.estado === 'RECIBIDO' ? '#166534' : '#991b1b'
              }}>
                {dte.estado}
              </div>
              <div className="doc-type">FACTURA ELECTRÓNICA</div>
              <div className="meta-row">
                <span className="label">N° Control:</span>
                <span className="value">{dte.numeroControl}</span>
              </div>
              <div className="meta-row">
                <span className="label">Cód. Generación:</span>
                <span className="value">{dte.codigoGeneracion}</span>
              </div>
            </div>
          </div>

          <hr className="divider" />

          {/* Secciones Emisor / Receptor */}
          <div className="info-grid">
            <div className="info-box">
              <h3 className="section-title">Emisor</h3>
              <p><strong>Actividad:</strong> {emisor.descActividad}</p>
              <p><strong>Dirección:</strong> {emisor.direccion.complemento}</p>
              <p><strong>Teléfono:</strong> {emisor.telefono}</p>
              <p><strong>Correo:</strong> {emisor.correo}</p>
            </div>
            <div className="info-box">
              <h3 className="section-title">Receptor</h3>
              <p><strong>Nombre:</strong> {receptor.nombre || 'Consumidor Final'}</p>
              <p><strong>Documento:</strong> {receptor.numDocumento || '—'}</p>
              <p><strong>Correo:</strong> {receptor.correo || '—'}</p>
            </div>
          </div>

          {/* Tabla de Items */}
          <div className="table-responsive">
            <table className="public-table">
              <thead>
                <tr>
                  <th>Cant.</th>
                  <th>Descripción</th>
                  <th className="text-right">P. Unitario</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td>{item.cantidad}</td>
                    <td>{item.descripcion}</td>
                    <td className="text-right">${Number(item.precioUni).toFixed(2)}</td>
                    <td className="text-right">${Number(item.ventaGravada || item.ventaExenta || item.ventaNoSuj).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resumen de Totales */}
          <div className="totals-section">
            <div className="totals-card">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>${Number(resumen.subTotalVentas || resumen.totalCompraAfecta).toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>IVA (13%):</span>
                <span>${Number(resumen.totalIva || resumen.totalIVAretenido || 0).toFixed(2)}</span>
              </div>
              {resumen.totalDescu > 0 && (
                <div className="total-row text-danger">
                  <span>Descuento:</span>
                  <span>-${Number(resumen.totalDescu).toFixed(2)}</span>
                </div>
              )}
              <div className="total-row grand-total">
                <span>TOTAL A PAGAR:</span>
                <span>${Number(dte.totalPagar).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Pie de Página */}
          <div className="doc-footer">
            <button 
              className="btn btn-primary d-flex align-items-center gap-2"
              onClick={() => window.open(`${API_BASE}/public/dte/${dte.id}/pdf`, '_blank')}
            >
              📥 Descargar PDF Original
            </button>
            <p className="mt-4 text-muted" style={{ fontSize: 12 }}>
              Este documento es una representación digital del DTE recibido por el Ministerio de Hacienda.
            </p>
          </div>
        </div>
      </main>

      <style>{`
        .public-portal {
          background-color: #f1f5f9;
          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
          color: #1e293b;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 20px;
        }
        .public-header {
          background-color: #ffffff;
          padding: 20px 0;
          margin-bottom: 40px;
        }
        .header-content {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .portal-logo {
          font-size: 32px;
          background: #2563eb;
          color: white;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }
        .header-text h1 {
          font-size: 18px;
          margin: 0;
          font-weight: 700;
        }
        .header-text p {
          font-size: 13px;
          margin: 0;
          color: #64748b;
        }
        .document-card {
          background: white;
          border-radius: 16px;
          padding: 40px;
          margin-bottom: 60px;
        }
        .doc-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .emisor-brand h2 {
          font-size: 24px;
          margin: 0;
          color: #1e3a8a;
        }
        .subtitle {
          color: #64748b;
          font-size: 14px;
          margin: 4px 0 12px;
        }
        .emisor-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
        }
        .doc-metadata {
          text-align: right;
          background: #f8fafc;
          padding: 16px;
          border-radius: 12px;
          min-width: 250px;
        }
        .status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 99px;
          margin-bottom: 12px;
        }
        .doc-type {
          font-weight: 800;
          font-size: 14px;
          color: #0f172a;
          margin-bottom: 12px;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .meta-row .label { color: #64748b; }
        .meta-row .value { font-weight: 600; font-family: monospace; }
        
        .divider { border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0; }
        
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-bottom: 32px;
        }
        .section-title {
          font-size: 16px;
          border-bottom: 2px solid #2563eb;
          display: inline-block;
          margin-bottom: 16px;
        }
        .info-box p { font-size: 13px; margin: 6px 0; color: #334155; }
        
        .public-table {
          width: 100%;
          border-collapse: collapse;
          margin: 32px 0;
        }
        .public-table th {
          background: #f8fafc;
          padding: 12px;
          text-align: left;
          font-size: 13px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
        }
        .public-table td {
          padding: 12px;
          font-size: 14px;
          border-bottom: 1px solid #f1f5f9;
        }
        .text-right { text-align: right !important; }
        
        .totals-section { display: flex; justify-content: flex-end; margin-top: 24px; }
        .totals-card { width: 300px; background: #f8fafc; padding: 20px; border-radius: 12px; }
        .total-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; }
        .grand-total {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 2px solid #e2e8f0;
          font-size: 18px;
          font-weight: 800;
          color: #1e3a8a;
        }
        
        .doc-footer { text-align: center; margin-top: 48px; border-top: 1px solid #e2e8f0; padding-top: 32px; }
        
        @media (max-width: 600px) {
          .doc-header { flex-direction: column; gap: 24px; }
          .doc-metadata { text-align: left; width: 100%; min-width: 0; }
          .info-grid { grid-template-columns: 1fr; gap: 24px; }
          .document-card { padding: 20px; }
        }
      `}</style>
    </div>
  );
}
