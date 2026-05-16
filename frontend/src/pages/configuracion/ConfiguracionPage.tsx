import { useState, useRef, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import apiClient, { API_BASE } from '../../api/apiClient';
import { ACTIVIDADES_ECONOMICAS } from '../../catalogs/actividades';
import { DEPARTAMENTOS, getMunicipios } from '../../catalogs/departamentos';
import { parseApiError } from '../../utils/parseApiError';

interface PuntoVentaRow {
  id: string;
  nombre: string;
  codPuntoVentaMh: string;
  activo: boolean;
}

interface SucursalRow {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string | null;
  codEstableMh: string;
  puntosVenta?: PuntoVentaRow[];
}

const emptySucursal = () => ({
  nombre: '',
  direccion: '',
  telefono: '',
  codEstableMh: '',
});

export function ConfiguracionPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error', texto: string } | null>(null);

  const {
    data: empresa,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['empresa'],
    queryFn: () => apiClient.get(`/empresa`).then(r => r.data),
  });

  const { data: sucursales = [] } = useQuery<SucursalRow[]>({
    queryKey: ['empresa-sucursales'],
    queryFn: () => apiClient.get(`/empresa/sucursales`).then(r => r.data),
    enabled: isAdmin,
  });

  const [nuevaSucursal, setNuevaSucursal] = useState(emptySucursal);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptySucursal);

  const [deptoSel, setDeptoSel] = useState('');
  const [muniSel, setMuniSel] = useState('');
  const [actDesc, setActDesc] = useState('');
  const [actCod, setActCod] = useState('');
  const [mhApiKey, setMhApiKey] = useState('');
  const [mhPasswordCert, setMhPasswordCert] = useState('');
  const [mhAmbiente, setMhAmbiente] = useState('00');

  useEffect(() => {
    if (empresa) {
      setDeptoSel(empresa.departamento || '');
      setMuniSel(empresa.municipio || '');
      setActDesc(empresa.descActividad || '');
      setActCod(empresa.codActividad || '');
      setMhApiKey(empresa.mhApiKey || '');
      setMhPasswordCert(empresa.mhPasswordCert || '');
      setMhAmbiente(empresa.mhAmbiente || '00');
    }
  }, [empresa]);

  const updateMut = useMutation({
    mutationFn: (d: any) => apiClient.patch(`/empresa`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa'] });
      setMensaje({ tipo: 'success', texto: 'Configuración actualizada correctamente' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: () => setMensaje({ tipo: 'error', texto: 'Error al actualizar la configuración' }),
  });

  const uploadLogoMut = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      return apiClient.post(`/empresa/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa'] });
      setMensaje({ tipo: 'success', texto: 'Logotipo actualizado correctamente' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: () => setMensaje({ tipo: 'error', texto: 'Error al subir el logotipo' }),
  });

  const uploadCertMut = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post(`/empresa/certificado`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa'] });
      setMensaje({ tipo: 'success', texto: 'Certificado digital subido con éxito' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: () => setMensaje({ tipo: 'error', texto: 'Error al subir el certificado .p12' }),
  });

  const generateNexaKeyMut = useMutation({
    mutationFn: () => apiClient.post(`/empresa/nexa-key`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa'] });
      setMensaje({ tipo: 'success', texto: 'API Key para Nexa generada con éxito' });
      // Abrir un prompt o mostrarla temporalmente si es necesario, 
      // pero ya se guardó en el perfil y se refrescará
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: () => setMensaje({ tipo: 'error', texto: 'Error al generar la API Key' }),
  });

  const crearSucursalMut = useMutation({
    mutationFn: (payload: typeof nuevaSucursal) =>
      apiClient.post('/empresa/sucursales', {
        nombre: payload.nombre,
        direccion: payload.direccion,
        telefono: payload.telefono || undefined,
        codEstableMh: payload.codEstableMh,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-sucursales'] });
      setNuevaSucursal(emptySucursal());
      setMensaje({ tipo: 'success', texto: 'Sucursal registrada' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: (e: unknown) =>
      setMensaje({ tipo: 'error', texto: parseApiError(e).join(' ') }),
  });

  const actualizarSucursalMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: typeof nuevaSucursal }) =>
      apiClient.patch(`/empresa/sucursales/${id}`, {
        nombre: payload.nombre,
        direccion: payload.direccion,
        telefono: payload.telefono || undefined,
        codEstableMh: payload.codEstableMh,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-sucursales'] });
      setEditandoId(null);
      setMensaje({ tipo: 'success', texto: 'Sucursal actualizada' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: (e: unknown) =>
      setMensaje({ tipo: 'error', texto: parseApiError(e).join(' ') }),
  });

  const eliminarSucursalMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/empresa/sucursales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-sucursales'] });
      setMensaje({ tipo: 'success', texto: 'Sucursal eliminada' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: (e: unknown) =>
      setMensaje({ tipo: 'error', texto: parseApiError(e).join(' ') }),
  });

  const [pvDraft, setPvDraft] = useState<Record<string, { nombre: string; codPuntoVentaMh: string }>>({});

  const crearPuntoVentaMut = useMutation({
    mutationFn: (p: { sucursalId: string; nombre: string; codPuntoVentaMh: string }) =>
      apiClient.post(`/empresa/sucursales/${p.sucursalId}/puntos-venta`, {
        nombre: p.nombre,
        codPuntoVentaMh: p.codPuntoVentaMh,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-sucursales'] });
      setMensaje({ tipo: 'success', texto: 'Punto de venta registrado' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: (e: unknown) =>
      setMensaje({ tipo: 'error', texto: parseApiError(e).join(' ') }),
  });

  const eliminarPuntoVentaMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/empresa/puntos-venta/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-sucursales'] });
      setMensaje({ tipo: 'success', texto: 'Punto de venta eliminado' });
      setTimeout(() => setMensaje(null), 3000);
    },
    onError: (e: unknown) =>
      setMensaje({ tipo: 'error', texto: parseApiError(e).join(' ') }),
  });

  if (!isAdmin) {
    return (
      <div className="page p-8">
        <div className="alert alert-error">Acceso denegado</div>
      </div>
    );
  }
  if (isLoading && !empresa) {
    return (
      <div className="page">
        <div className="topbar">
          <span className="topbar-title">⚙️ Configuración de la Empresa</span>
        </div>
        <div className="loading-wrap" style={{ minHeight: '40vh' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!empresa) {
    const detalle = isError ? parseApiError(error).join(' ') : 'No hay datos de empresa.';
    return (
      <div className="page">
        <div className="topbar">
          <span className="topbar-title">⚙️ Configuración de la Empresa</span>
        </div>
        <div style={{ padding: '28px 28px', maxWidth: 560 }}>
          <div
            className="empty-state empty-state--rich"
            style={{
              border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--border))',
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--danger) 8%, var(--color-surface))',
              textAlign: 'left',
            }}
          >
            <div className="empty-state-icon" aria-hidden>
              📡
            </div>
            <h2 className="empty-state-title" style={{ color: 'var(--text)' }}>
              No se pudo cargar la configuración
            </h2>
            <p className="empty-state-desc" style={{ marginBottom: 16 }}>
              {detalle}
            </p>
            {isError && (
              <div className="empty-state-actions" style={{ justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={isRefetching}
                  onClick={() => refetch()}
                >
                  {isRefetching ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 16, marginBottom: 0, lineHeight: 1.5 }}>
              Comprueba que el API NestJS esté en ejecución y que en el frontend{' '}
              <code style={{ fontSize: 11 }}>VITE_API_URL</code> apunte al mismo origen que el servidor
              (incluye <code style={{ fontSize: 11 }}>/api</code>). URL configurada:{' '}
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{API_BASE}</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());
    // Convertir checkbox a boolean
    data.esAgenteRetencion = formData.get('esAgenteRetencion') === 'on';
    updateMut.mutate(data);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogoMut.mutate(file);
  };

  const handleCertChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadCertMut.mutate(file);
  };

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">⚙️ Configuración de la Empresa</span>
      </div>

      <div className="page-content" style={{ padding: '24px 28px', maxWidth: 1000 }}>
        {mensaje && (
          <div className={`alert alert-${mensaje.tipo}`} style={{ marginBottom: 20 }}>
            {mensaje.tipo === 'success' ? '✅' : '❌'} {mensaje.texto}
          </div>
        )}

        <div className="grid grid-2" style={{ gap: 24, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px' }}>

          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 20 }}>Datos Generales y Fiscales</h3>
            <form onSubmit={handleSubmit}>
              <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Nombre Legal / Razón Social</label>
                  <input className="form-control" name="nombreLegal" defaultValue={empresa.nombreLegal} required />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Nombre Comercial</label>
                  <input className="form-control" name="nombreComercial" defaultValue={empresa.nombreComercial} />
                </div>
                <div className="form-group">
                  <label className="form-label">NIT</label>
                  <input className="form-control" name="nit" defaultValue={empresa.nit} required />
                </div>
                <div className="form-group">
                  <label className="form-label">NRC</label>
                  <input className="form-control" name="nrc" defaultValue={empresa.nrc} required />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Giro / Actividad Económica (Busca por nombre o código)</label>
                  <input
                    className="form-control"
                    name="descActividad"
                    list="lista-actividades"
                    value={actDesc}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActDesc(val);
                      const found = ACTIVIDADES_ECONOMICAS.find(
                        a => a.descripcion === val || a.codigo === val
                      );
                      if (found) setActCod(found.codigo);
                    }}
                    placeholder="Escribe nombre o código de actividad..."
                    required
                  />
                  <datalist id="lista-actividades">
                    {ACTIVIDADES_ECONOMICAS.map(a => (
                      <option key={a.codigo} value={a.descripcion}>{a.codigo}</option>
                    ))}
                  </datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Código Actividad</label>
                  <input
                    className="form-control"
                    name="codActividad"
                    value={actCod}
                    onChange={(e) => {
                      const cod = e.target.value;
                      setActCod(cod);
                      const found = ACTIVIDADES_ECONOMICAS.find(a => a.codigo === cod);
                      if (found) setActDesc(found.descripcion);
                    }}
                    placeholder="Ej: 46900"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Departamento</label>
                  <select
                    className="form-control"
                    name="departamento"
                    value={deptoSel}
                    onChange={(e) => {
                      setDeptoSel(e.target.value);
                      setMuniSel(''); // Reset municipio when depto changes
                    }}
                    required
                  >
                    <option value="">Seleccione Departamento</option>
                    {DEPARTAMENTOS.map(d => (
                      <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Municipio</label>
                  <select
                    className="form-control"
                    name="municipio"
                    value={muniSel}
                    onChange={(e) => setMuniSel(e.target.value)}
                    required
                  >
                    <option value="">Seleccione Municipio</option>
                    {getMunicipios(deptoSel).map(m => (
                      <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Dirección (Complemento)</label>
                  <input className="form-control" name="complemento" defaultValue={empresa.complemento} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-control" name="telefono" defaultValue={empresa.telefono} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Correo Electrónico</label>
                  <input className="form-control" name="correo" type="email" defaultValue={empresa.correo} required />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    name="esAgenteRetencion"
                    id="esAgenteRetencion"
                    defaultChecked={empresa.esAgenteRetencion}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <label htmlFor="esAgenteRetencion" style={{ fontWeight: 600, cursor: 'pointer' }}>
                    Esta empresa es Agente de Retención (IVA 1%)
                  </label>
                </div>
              </div>
              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" type="submit" disabled={updateMut.isPending}>
                  {updateMut.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>Logotipo</h3>
              <div style={{
                width: '100%',
                height: 180,
                border: '2px dashed var(--border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                marginBottom: 16,
                background: '#f8fafc'
              }}>
                {empresa.logoPath ? (
                  <img
                    src={`${API_BASE.replace('/api', '')}/${empresa.logoPath}`}
                    alt="Logo"
                    style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>Sin logotipo</span>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadLogoMut.isPending ? 'Subiendo...' : 'Subir Logotipo'}
              </button>
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 12 }}>
                Formatos permitidos: PNG, JPG. Relación recomendada: Horizontal.
              </p>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>🔑 Credenciales de Hacienda</h3>
              <div>
                <div className="form-group">
                  <label className="form-label">API Key (Hacienda)</label>
                  <input className="form-control" type="password" value={mhApiKey} onChange={e => setMhApiKey(e.target.value)} placeholder="••••••••" />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Password de Certificado</label>
                  <input className="form-control" type="password" value={mhPasswordCert} onChange={e => setMhPasswordCert(e.target.value)} placeholder="••••••••" />
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Ambiente de Transmisión</label>
                  <select className="form-control" value={mhAmbiente} onChange={e => setMhAmbiente(e.target.value)}>
                    <option value="00">Pruebas / Sandbox</option>
                    <option value="01">Producción</option>
                  </select>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: 12 }}
                    onClick={() => updateMut.mutate({ mhApiKey, mhPasswordCert, mhAmbiente })}>
                    Guardar Credenciales
                  </button>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

              <div className="form-group">
                <label className="form-label">Certificado Digital (.p12 / .pfx / .crt)</label>
                <div style={{ fontSize: 11, color: empresa.mhCertificadoPath ? '#16a34a' : '#dc2626', marginBottom: 8, fontWeight: 600 }}>
                  {empresa.mhCertificadoPath ? '✅ Certificado cargado' : '❌ Sin certificado'}
                </div>
                <input type="file" ref={certInputRef} onChange={handleCertChange} accept=".p12,.pfx,.crt" style={{ display: 'none' }} />
                <button
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%' }}
                  onClick={() => certInputRef.current?.click()}
                >
                  {uploadCertMut.isPending ? 'Subiendo...' : 'Subir Certificado (.p12 / .crt)'}
                </button>
              </div>
            </div>

            <div className="card config-fiscal-nexa-card" style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>Identificadores fiscales</h3>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 11 }}>Cód. Establecimiento MH</label>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{empresa.codEstableMh}</div>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Cód. Punto Venta MH</label>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{empresa.codPuntoVentaMh}</div>
              </div>

              <div className="config-nexa-panel">
                <div className="config-nexa-panel__head">
                  <div className="config-nexa-icon-wrap" aria-hidden>
                    <svg
                      className="config-nexa-icon"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M9 2v5M15 2v5M8 7h8a2 2 0 012 2v2a6 6 0 01-12 0V9a2 2 0 012-2z"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 14v8"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div className="config-nexa-panel__head-text">
                    <h4 className="config-nexa-panel__title">Integración NEXA</h4>
                    <p className="config-nexa-panel__kicker">API · POS externo</p>
                  </div>
                </div>

                <p className="config-nexa-panel__lead">
                  Conecta tu POS Nexa con este sistema mediante una API key exclusiva de tu comercio.
                </p>

                {empresa.internalApiKey ? (
                  <div className="config-nexa-panel__field">
                    <label className="form-label" style={{ fontSize: 11 }}>
                      Tu API key privada
                    </label>
                    <div className="config-nexa-key">
                      <span className="config-nexa-key__value">{empresa.internalApiKey}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm config-nexa-key__copy"
                        title="Copiar"
                        onClick={() => {
                          navigator.clipboard.writeText(empresa.internalApiKey);
                          setMensaje({ tipo: 'success', texto: 'Copiado al portapapeles' });
                          setTimeout(() => setMensaje(null), 2000);
                        }}
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="config-nexa-empty">
                    <p className="config-nexa-empty__text">
                      Aún no hay llave de integración. Genera una para enlazar tu punto de venta.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  className={
                    empresa.internalApiKey
                      ? 'btn btn-primary btn-sm config-nexa-panel__cta'
                      : 'btn btn-sm config-nexa-panel__cta btn-nexa-generate'
                  }
                  onClick={() => {
                    if (empresa.internalApiKey && !confirm('¿Estás seguro? La llave anterior dejará de funcionar inmediatamente.'))
                      return;
                    generateNexaKeyMut.mutate();
                  }}
                  disabled={generateNexaKeyMut.isPending}
                >
                  {generateNexaKeyMut.isPending ? 'Generando…' : empresa.internalApiKey ? 'Regenerar API key' : 'Generar API key'}
                </button>

                <p className="config-nexa-panel__foot">
                  No compartas esta llave. Identifica de forma única a tu comercio en la red Nexa.
                </p>
              </div>
            </div>
          </div>

        </div>

        <section className="config-sucursales" aria-labelledby="config-sucursales-heading">
          <div className="config-sucursales__accent" aria-hidden />
          <div className="config-sucursales__head">
            <h3 id="config-sucursales-heading" className="config-sucursales__title">
              Sucursales / establecimientos (MH)
            </h3>
            <p className="config-sucursales__lead">
              Esta lista es solo para <strong>sucursales o locales adicionales</strong>, cada uno con su{' '}
              <strong>código de establecimiento MH</strong>. Los códigos de matriz están en «Identificadores fiscales»
              arriba. Para cada sucursal adicional, registra también los <strong>puntos de venta MH</strong> (ej. P002)
              que usará Nexa: iFactu validará el par establecimiento + punto de venta al emitir. Un solo local: deja la
              tabla vacía y usa solo los identificadores fiscales. El límite de sucursales depende del plan.
            </p>
          </div>

          {sucursales.length === 0 ? (
            <div className="config-sucursales-empty-wrap">
              <div className="config-sucursales-hint" role="status">
                <span className="config-sucursales-hint__label">Códigos MH que usa hoy tu empresa (único punto)</span>
                <span className="config-sucursales-hint__values">
                  Establecimiento <strong>{empresa.codEstableMh}</strong>
                  <span className="config-sucursales-hint__sep" aria-hidden>
                    ·
                  </span>
                  Punto de venta <strong>{empresa.codPuntoVentaMh}</strong>
                </span>
                <span className="config-sucursales-hint__note">
                  Definidos en «Identificadores fiscales». No hace falta crear una sucursal aquí si solo tienes este
                  local.
                </span>
              </div>
              <div className="config-sucursales-empty">
                <div className="config-sucursales-empty__icon" aria-hidden>
                  🏢
                </div>
                <p className="config-sucursales-empty__title">No hay sucursales adicionales registradas</p>
                <p className="config-sucursales-empty__text">
                  Eso es lo habitual con <strong>un solo establecimiento</strong>: emites usando los códigos de la
                  tarjeta de identificadores. Agrega una fila abajo solo si abres otro local con otro código MH
                  distinto.
                </p>
              </div>
            </div>
          ) : (
            <div className="config-sucursales-table-wrap">
              <table className="table config-sucursales-table" style={{ fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Cód. establecimiento</th>
                    <th>Nombre</th>
                    <th>Dirección</th>
                    <th>Teléfono</th>
                    <th style={{ width: 160 }} />
                  </tr>
                </thead>
                <tbody>
                  {sucursales.map(s => {
                    const draftPv = pvDraft[s.id] ?? { nombre: '', codPuntoVentaMh: '' };
                    if (editandoId === s.id) {
                      return (
                        <tr key={s.id}>
                          <td>
                            <input
                              className="form-control"
                              style={{ minWidth: 88 }}
                              value={editDraft.codEstableMh}
                              onChange={e => setEditDraft({ ...editDraft, codEstableMh: e.target.value })}
                              maxLength={4}
                              placeholder="M001"
                            />
                          </td>
                          <td>
                            <input
                              className="form-control"
                              value={editDraft.nombre}
                              onChange={e => setEditDraft({ ...editDraft, nombre: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="form-control"
                              value={editDraft.direccion}
                              onChange={e => setEditDraft({ ...editDraft, direccion: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="form-control"
                              value={editDraft.telefono}
                              onChange={e => setEditDraft({ ...editDraft, telefono: e.target.value })}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={actualizarSucursalMut.isPending}
                                onClick={() =>
                                  actualizarSucursalMut.mutate({ id: s.id, payload: editDraft })
                                }
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setEditandoId(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <Fragment key={s.id}>
                        <tr>
                          <td>
                            <span className="tipo-pill">{s.codEstableMh}</span>
                          </td>
                          <td className="text-main">{s.nombre}</td>
                          <td>{s.direccion}</td>
                          <td>{s.telefono ?? '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setEditandoId(s.id);
                                  setEditDraft({
                                    nombre: s.nombre,
                                    direccion: s.direccion,
                                    telefono: s.telefono ?? '',
                                    codEstableMh: s.codEstableMh,
                                  });
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)' }}
                                disabled={eliminarSucursalMut.isPending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `¿Eliminar la sucursal «${s.nombre}»? No debe tener DTEs asociados.`,
                                    )
                                  ) {
                                    eliminarSucursalMut.mutate(s.id);
                                  }
                                }}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                        <tr className="config-sucursales__pv-row">
                          <td colSpan={5}>
                            <div className="config-pv-block">
                              <div className="config-pv-block__head">
                                <span className="config-pv-block__title">Puntos de venta (MH)</span>
                                <span className="config-pv-block__sub">
                                  Nexa debe enviar el mismo <code>codPuntoVenta</code> que registres aquí para este
                                  establecimiento.
                                </span>
                              </div>
                              {(s.puntosVenta?.length ?? 0) === 0 ? (
                                <p className="config-pv-block__empty">
                                  Sin puntos de venta: solo se aceptará el punto de venta de matriz (
                                  <strong>{empresa.codPuntoVentaMh}</strong>) para esta sucursal hasta que agregues al
                                  menos uno.
                                </p>
                              ) : (
                                <ul className="config-pv-block__list">
                                  {(s.puntosVenta ?? []).map(pv => (
                                    <li key={pv.id} className="config-pv-block__item">
                                      <span className="tipo-pill">{pv.codPuntoVentaMh}</span>
                                      <span className="config-pv-block__item-name">{pv.nombre}</span>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        style={{ color: 'var(--danger)' }}
                                        disabled={eliminarPuntoVentaMut.isPending}
                                        onClick={() => {
                                          if (
                                            confirm(
                                              `¿Eliminar el punto de venta «${pv.codPuntoVentaMh}»? No debe tener DTEs asociados.`,
                                            )
                                          ) {
                                            eliminarPuntoVentaMut.mutate(pv.id);
                                          }
                                        }}
                                      >
                                        Quitar
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="config-pv-block__add">
                                <input
                                  className="form-control"
                                  placeholder="Nombre (ej. Caja 1)"
                                  value={draftPv.nombre}
                                  onChange={e =>
                                    setPvDraft(d => ({
                                      ...d,
                                      [s.id]: { ...draftPv, nombre: e.target.value },
                                    }))
                                  }
                                />
                                <input
                                  className="form-control"
                                  placeholder="Cód. PV (ej. P002)"
                                  maxLength={15}
                                  value={draftPv.codPuntoVentaMh}
                                  onChange={e =>
                                    setPvDraft(d => ({
                                      ...d,
                                      [s.id]: { ...draftPv, codPuntoVentaMh: e.target.value },
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={
                                    crearPuntoVentaMut.isPending ||
                                    !draftPv.nombre.trim() ||
                                    !draftPv.codPuntoVentaMh.trim()
                                  }
                                  onClick={() => {
                                    crearPuntoVentaMut.mutate(
                                      {
                                        sucursalId: s.id,
                                        nombre: draftPv.nombre.trim(),
                                        codPuntoVentaMh: draftPv.codPuntoVentaMh.trim(),
                                      },
                                      {
                                        onSuccess: () =>
                                          setPvDraft(d => {
                                            const n = { ...d };
                                            delete n[s.id];
                                            return n;
                                          }),
                                      },
                                    );
                                  }}
                                >
                                  Agregar punto de venta
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          )}

          <div className="config-sucursales__form">
            <h4 className="config-sucursales__form-title">Agregar sucursal</h4>
            <div className="config-sucursales-form-grid">
              <div className="form-group config-sucursales-form-grid__cod">
                <label className="form-label">Cód. establecimiento MH</label>
                <input
                  className="form-control"
                  value={nuevaSucursal.codEstableMh}
                  onChange={e => setNuevaSucursal({ ...nuevaSucursal, codEstableMh: e.target.value })}
                  placeholder="M001"
                  maxLength={4}
                />
              </div>
              <div className="form-group config-sucursales-form-grid__nombre">
                <label className="form-label">Nombre</label>
                <input
                  className="form-control"
                  value={nuevaSucursal.nombre}
                  onChange={e => setNuevaSucursal({ ...nuevaSucursal, nombre: e.target.value })}
                  placeholder="Sucursal centro"
                />
              </div>
              <div className="form-group config-sucursales-form-grid__dir">
                <label className="form-label">Dirección</label>
                <input
                  className="form-control"
                  value={nuevaSucursal.direccion}
                  onChange={e => setNuevaSucursal({ ...nuevaSucursal, direccion: e.target.value })}
                  placeholder="Calle, municipio…"
                />
              </div>
              <div className="form-group config-sucursales-form-grid__tel">
                <label className="form-label">Teléfono</label>
                <input
                  className="form-control"
                  value={nuevaSucursal.telefono}
                  onChange={e => setNuevaSucursal({ ...nuevaSucursal, telefono: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="form-group config-sucursales-form-grid__submit">
                <button
                  type="button"
                  className="btn btn-primary config-sucursales-form-grid__btn"
                  disabled={
                    crearSucursalMut.isPending ||
                    !nuevaSucursal.nombre.trim() ||
                    !nuevaSucursal.direccion.trim() ||
                    !nuevaSucursal.codEstableMh.trim()
                  }
                  onClick={() => crearSucursalMut.mutate(nuevaSucursal)}
                >
                  {crearSucursalMut.isPending ? 'Guardando…' : 'Agregar sucursal'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
