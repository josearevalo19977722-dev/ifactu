export function ExtensionPrivacidadPage() {
  const s = {
    page: {
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '0 0 80px',
    } as React.CSSProperties,
    container: {
      maxWidth: 760,
      margin: '0 auto',
      padding: '0 24px',
    } as React.CSSProperties,
    h1: {
      fontSize: 'clamp(26px, 5vw, 40px)',
      fontWeight: 900,
      marginBottom: 8,
      lineHeight: 1.2,
    } as React.CSSProperties,
    h2: {
      fontSize: 18,
      fontWeight: 700,
      marginTop: 40,
      marginBottom: 12,
      color: '#a5b4fc',
      borderBottom: '1px solid rgba(99,102,241,.25)',
      paddingBottom: 8,
    } as React.CSSProperties,
    p: {
      fontSize: 15,
      color: '#cbd5e1',
      lineHeight: 1.8,
      marginBottom: 12,
    } as React.CSSProperties,
    ul: {
      paddingLeft: 22,
      margin: '8px 0 16px',
    } as React.CSSProperties,
    li: {
      fontSize: 15,
      color: '#cbd5e1',
      lineHeight: 1.8,
      marginBottom: 6,
    } as React.CSSProperties,
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      background: 'rgba(99,102,241,.15)',
      border: '1px solid rgba(99,102,241,.3)',
      borderRadius: 99,
      padding: '6px 16px',
      fontSize: 13,
      fontWeight: 600,
      color: '#a5b4fc',
      marginBottom: 20,
    } as React.CSSProperties,
    callout: {
      background: 'rgba(16,185,129,.08)',
      border: '1px solid rgba(16,185,129,.25)',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 20,
    } as React.CSSProperties,
    calloutText: {
      fontSize: 14,
      color: '#6ee7b7',
      lineHeight: 1.7,
      margin: 0,
    } as React.CSSProperties,
  };

  const fechaActualizacion = '24 de mayo de 2025';

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={{ textAlign: 'center', padding: 'clamp(32px, 7vw, 64px) 20px clamp(20px, 4vw, 48px)' }}>
        <div style={s.badge}>
          <span style={{ fontSize: 16 }}>🔒</span>
          Política de Privacidad — iFactu_Conta
        </div>
        <h1 style={s.h1}>Política de Privacidad</h1>
        <p style={{ ...s.p, maxWidth: 540, margin: '0 auto', color: '#64748b' }}>
          Extensión Chrome · <strong style={{ color: '#94a3b8' }}>iFactu_Conta</strong><br />
          Última actualización: {fechaActualizacion}
        </p>
      </div>

      <div style={s.container}>

        {/* Resumen destacado */}
        <div style={s.callout}>
          <p style={s.calloutText}>
            ✅ <strong>Resumen:</strong> iFactu_Conta accede a tus correos de Gmail únicamente
            para encontrar y descargar tus comprobantes fiscales electrónicos (DTE). <strong>No
            almacenamos tus correos ni tus datos personales en nuestros servidores.</strong> Todo
            queda en tu equipo.
          </p>
        </div>

        {/* 1 */}
        <h2 style={s.h2}>1. Quiénes somos</h2>
        <p style={s.p}>
          <strong>J Solutions</strong> (en adelante "nosotros", "iFactu") es una empresa de
          desarrollo de software con sede en El Salvador. Operamos la plataforma iFactu para la
          emisión y gestión de Documentos Tributarios Electrónicos (DTE) conforme a la normativa
          del Ministerio de Hacienda de El Salvador.
        </p>
        <p style={s.p}>
          Contacto: <a href="mailto:jsolution.sv@gmail.com" style={{ color: '#818cf8' }}>jsolution.sv@gmail.com</a>
        </p>

        {/* 2 */}
        <h2 style={s.h2}>2. Qué datos accede la extensión</h2>
        <p style={s.p}>
          La extensión <strong>iFactu_Conta</strong> solicita acceso de <em>solo lectura</em> a
          tu cuenta de Gmail mediante la API oficial de Google. Específicamente:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>
            <strong>Mensajes de correo electrónico</strong> que contengan archivos adjuntos JSON
            y/o PDF correspondientes a DTEs emitidos por proveedores (facturas, créditos fiscales,
            notas de remisión, etc.).
          </li>
          <li style={s.li}>
            La extensión busca correos usando filtros específicos (ejemplo: <code style={{ fontSize: 12, background: 'rgba(255,255,255,.08)', padding: '1px 6px', borderRadius: 4 }}>filename:*.json</code>) y
            únicamente descarga los adjuntos que correspondan a DTE válidos.
          </li>
          <li style={s.li}>
            <strong>No</strong> leemos el cuerpo de correos personales, ni accedemos a contactos,
            calendario ni ningún otro servicio de Google.
          </li>
        </ul>

        {/* 3 */}
        <h2 style={s.h2}>3. Cómo usamos los datos</h2>
        <p style={s.p}>Los datos a los que accedemos se utilizan exclusivamente para:</p>
        <ul style={s.ul}>
          <li style={s.li}>Identificar correos con archivos adjuntos de DTE (JSON + PDF).</li>
          <li style={s.li}>Descargar esos adjuntos a tu equipo local para su procesamiento contable.</li>
          <li style={s.li}>Guardar el estado de los correos procesados en el <strong>almacenamiento local</strong> de
            la extensión (IndexedDB en tu navegador) para evitar descargas duplicadas.</li>
        </ul>
        <p style={s.p}>
          <strong>En ningún caso</strong> enviamos el contenido de tus correos, el cuerpo de los
          mensajes ni los archivos adjuntos a los servidores de iFactu o a terceros.
        </p>

        {/* 4 */}
        <h2 style={s.h2}>4. Datos que sí se envían a nuestros servidores</h2>
        <p style={s.p}>
          La única comunicación con los servidores de iFactu ocurre para:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>
            <strong>Validar la licencia</strong>: se envía tu clave de activación (API Key) y un
            identificador anónimo del equipo para verificar que la licencia sea válida. No se
            envían datos personales ni correos.
          </li>
          <li style={s.li}>
            <strong>Conteo de uso</strong>: se registra el número de DTEs procesados en el mes
            para aplicar los límites del plan contratado. No se registra información del contenido
            de los DTEs.
          </li>
        </ul>

        {/* 5 */}
        <h2 style={s.h2}>5. Almacenamiento y retención de datos</h2>
        <ul style={s.ul}>
          <li style={s.li}>
            <strong>Local (tu equipo)</strong>: la extensión guarda en IndexedDB del navegador el
            listado de IDs de correos ya procesados y la configuración de cuentas (tokens OAuth de
            Google). Estos datos nunca salen de tu dispositivo.
          </li>
          <li style={s.li}>
            <strong>Servidores iFactu</strong>: solo se almacena la clave de licencia, el
            identificador de dispositivo, el plan activo y el contador mensual de DTEs procesados.
          </li>
          <li style={s.li}>
            Los tokens OAuth de Google son administrados exclusivamente por la API de Chrome
            Identity y Google; iFactu nunca tiene acceso a ellos.
          </li>
        </ul>

        {/* 6 */}
        <h2 style={s.h2}>6. Compartir datos con terceros</h2>
        <p style={s.p}>
          <strong>No vendemos, arrendamos ni compartimos</strong> tus datos personales ni el
          contenido de tus correos con ningún tercero. La única excepción son:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>
            <strong>Google APIs</strong>: la extensión usa las APIs de Google para autenticarse y
            leer correos. El uso se rige por la{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>
              Política de Privacidad de Google
            </a>{' '}y las{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>
              Políticas de Datos de Usuario de los Servicios API de Google
            </a>.
          </li>
          <li style={s.li}>
            <strong>N1CO</strong>: procesamos pagos a través de N1CO. Al comprar una licencia,
            aplica su política de privacidad para datos de pago. iFactu no recibe ni almacena
            datos de tarjetas de crédito.
          </li>
        </ul>

        {/* 7 */}
        <h2 style={s.h2}>7. Cumplimiento con las Políticas de Google</h2>
        <p style={s.p}>
          El uso que hacemos de la información recibida a través de las APIs de Google cumple con
          la{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>
            Política de Datos de Usuario de los Servicios API de Google
          </a>, incluyendo los requisitos de Uso Limitado. En particular:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Los datos de Gmail se usan únicamente para la funcionalidad principal de la extensión (descarga de DTEs).</li>
          <li style={s.li}>No usamos los datos para publicidad ni para construir perfiles de usuario.</li>
          <li style={s.li}>No transferimos los datos de Gmail a terceros, salvo lo necesario para operar la extensión.</li>
          <li style={s.li}>No permitimos que personas lean correos de usuarios salvo con consentimiento explícito del usuario para casos de soporte técnico.</li>
        </ul>

        {/* 8 */}
        <h2 style={s.h2}>8. Tus derechos y control sobre los datos</h2>
        <p style={s.p}>Puedes en cualquier momento:</p>
        <ul style={s.ul}>
          <li style={s.li}>
            <strong>Revocar el acceso a Gmail</strong>: desde{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>
              myaccount.google.com/permissions
            </a>{' '}elimina "iFactu_Conta" de las aplicaciones con acceso.
          </li>
          <li style={s.li}>
            <strong>Borrar datos locales</strong>: desinstala la extensión desde Chrome. Todos los
            datos en IndexedDB se eliminan automáticamente.
          </li>
          <li style={s.li}>
            <strong>Cancelar tu licencia</strong>: escríbenos a{' '}
            <a href="mailto:jsolution.sv@gmail.com" style={{ color: '#818cf8' }}>jsolution.sv@gmail.com</a>{' '}
            para eliminar tus datos de nuestros servidores.
          </li>
        </ul>

        {/* 9 */}
        <h2 style={s.h2}>9. Seguridad</h2>
        <p style={s.p}>
          Implementamos medidas técnicas para proteger los datos almacenados en nuestros
          servidores: comunicaciones cifradas con TLS/HTTPS, acceso restringido a la base de
          datos y claves de licencia con hash. Sin embargo, ningún sistema es 100% seguro y no
          podemos garantizar la seguridad absoluta de la información transmitida por Internet.
        </p>

        {/* 10 */}
        <h2 style={s.h2}>10. Cambios a esta política</h2>
        <p style={s.p}>
          Podemos actualizar esta Política de Privacidad ocasionalmente. Te notificaremos de
          cambios significativos publicando la nueva versión en esta página con la fecha de
          actualización. Te recomendamos revisar esta página periódicamente.
        </p>

        {/* 11 */}
        <h2 style={s.h2}>11. Contacto</h2>
        <p style={s.p}>
          Si tienes preguntas o solicitudes sobre esta Política de Privacidad, contáctanos:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>📧 <a href="mailto:jsolution.sv@gmail.com" style={{ color: '#818cf8' }}>jsolution.sv@gmail.com</a></li>
          <li style={s.li}>🌐 <a href="https://ifactu.jsolutionsv.com" target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>ifactu.jsolutionsv.com</a></li>
        </ul>

        {/* Footer */}
        <div style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.08)', textAlign: 'center' }}>
          <p style={{ ...s.p, color: '#475569', fontSize: 13 }}>
            © 2025 J Solutions · iFactu · El Salvador
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
            <a href="/extension" style={{ color: '#818cf8', fontSize: 13, textDecoration: 'none' }}>← Volver a la tienda</a>
          </div>
        </div>
      </div>
    </div>
  );
}
