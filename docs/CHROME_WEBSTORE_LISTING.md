# Chrome Web Store — iFactu_Conta
## Textos y materiales para la publicación

---

## 1. NOMBRE DE LA EXTENSIÓN
```
iFactu_Conta
```

---

## 2. DESCRIPCIÓN CORTA (máx. 132 caracteres)
```
Descarga automáticamente tus comprobantes fiscales electrónicos (DTE) desde Gmail. Para contadores SV.
```
*(101 caracteres — dentro del límite)*

---

## 3. DESCRIPCIÓN LARGA (máx. 16 000 caracteres)

```
iFactu_Conta es la herramienta indispensable para contadores y empresas de El Salvador que reciben Documentos Tributarios Electrónicos (DTE) de sus proveedores por correo electrónico.

¿Cansado de descargar facturas manualmente una por una desde Gmail? iFactu_Conta lo hace por ti en segundos.

──────────────────────────────────────
🚀 ¿QUÉ HACE ESTA EXTENSIÓN?
──────────────────────────────────────

iFactu_Conta escanea tu bandeja de entrada de Gmail y detecta automáticamente los correos que contienen archivos adjuntos de DTE en formato JSON y PDF emitidos bajo la normativa del Ministerio de Hacienda de El Salvador.

Una vez detectados, los descarga y organiza directamente en tu equipo, listos para importar a tu sistema contable.

──────────────────────────────────────
✅ TIPOS DE DTE COMPATIBLES
──────────────────────────────────────

• Factura de Consumidor Final (CF) — Tipo 01
• Comprobante de Crédito Fiscal (CCF) — Tipo 03
• Nota de Remisión (NRE) — Tipo 04
• Factura de Exportación (FEXE) — Tipo 11
• Comprobante de Retención — Tipo 07
• Factura de Sujeto Excluido (FSE) — Tipo 14
• Nota de Débito y Crédito
• Y todos los DTE emitidos conforme a la normativa vigente de Hacienda SV

──────────────────────────────────────
⚡ CARACTERÍSTICAS PRINCIPALES
──────────────────────────────────────

📥 DESCARGA AUTOMÁTICA
Activa el modo Autopilot y olvídate de buscar facturas. La extensión escanea tu correo periódicamente y descarga los DTE nuevos sin que tengas que hacer nada.

📄 JSON + PDF EN UN CLIC
Descarga ambos archivos del DTE (el JSON oficial firmado digitalmente y el PDF de visualización) con un solo clic.

🔍 DETECCIÓN INTELIGENTE
Identifica automáticamente los correos con DTE adjuntos usando filtros de la API oficial de Gmail. No mezcla correos personales ni documentos que no son DTE.

🤖 AUTOPILOT
Configura el intervalo de escaneo (cada 15 min, 1 hora, etc.) y la extensión trabajará en segundo plano sin molestarte.

🔒 TUS DATOS SON TUYOS
Los DTE descargados se guardan únicamente en tu equipo. iFactu_Conta no sube el contenido de tus correos ni tus documentos a ningún servidor externo.

👥 MÚLTIPLES CUENTAS DE GMAIL
Conecta varias cuentas de correo y descarga DTE de todas ellas desde un solo panel.

📊 CONTADOR DE USO
Lleva el registro de cuántos DTE has procesado en el mes según tu plan contratado.

──────────────────────────────────────
💼 ¿PARA QUIÉN ES?
──────────────────────────────────────

• Contadores que gestionan múltiples empresas en El Salvador
• Empresas que reciben decenas o cientos de DTE al mes por correo
• Usuarios de la plataforma iFactu que quieren automatizar su flujo contable
• Cualquier profesional que trabaje con comprobantes fiscales electrónicos de Hacienda SV

──────────────────────────────────────
🛒 PLANES Y PRECIOS
──────────────────────────────────────

Visita ifactu.jsolutionsv.com/extension para ver los planes disponibles:

• Plan Mensual — Para empezar sin compromiso
• Plan Anual — El más popular, ahorra vs mensual
• Plan Vitalicio — Pago único, sin suscripción mensual
  · Licencia 1 equipo
  · Licencia 2 equipos
  · Licencia 5 equipos

Todos los planes incluyen soporte por correo y actualizaciones.

──────────────────────────────────────
🔑 ACTIVACIÓN
──────────────────────────────────────

1. Compra tu licencia en ifactu.jsolutionsv.com/extension
2. Recibirás tu clave por correo inmediatamente
3. Abre las opciones de la extensión e ingresa tu clave
4. Conecta tu cuenta de Gmail y empieza a descargar

──────────────────────────────────────
🔐 PRIVACIDAD Y SEGURIDAD
──────────────────────────────────────

• Acceso de solo lectura a Gmail (no enviamos ni modificamos correos)
• Los archivos DTE se guardan localmente en tu equipo
• No almacenamos el contenido de tus correos en nuestros servidores
• Cumplimos con la Política de Datos de Usuario de las APIs de Google
• Política de privacidad completa: ifactu.jsolutionsv.com/privacidad-extension

──────────────────────────────────────
📞 SOPORTE
──────────────────────────────────────

¿Tienes preguntas o problemas? Escríbenos a jsolution.sv@gmail.com

Sitio web: ifactu.jsolutionsv.com
```

---

## 4. JUSTIFICACIÓN DE PERMISOS
*(Para el formulario de la Chrome Web Store — cada permiso debe justificarse)*

### `storage`
> **Justificación:** La extensión guarda en almacenamiento local la clave de licencia del usuario, el token OAuth de Gmail, la lista de IDs de correos ya procesados (para evitar duplicados), la configuración del intervalo de Autopilot y el fingerprint del dispositivo. Sin este permiso la extensión no puede recordar el estado entre sesiones.

### `downloads`
> **Justificación:** La función principal de la extensión es descargar los archivos adjuntos JSON y PDF de los correos de DTE al sistema de archivos del usuario. Sin este permiso no es posible guardar los comprobantes fiscales en el equipo del contador.

### `notifications`
> **Justificación:** La extensión muestra notificaciones del sistema cuando el Autopilot completa un ciclo de descarga exitoso, cuando hay un error de autenticación con Gmail, o cuando se acerca al límite mensual de DTEs del plan. Esto permite al usuario estar informado sin tener que abrir el popup manualmente.

### `alarms`
> **Justificación:** El modo Autopilot usa la API `chrome.alarms` para ejecutar escaneos periódicos de la bandeja de Gmail (cada 15 minutos, 1 hora, etc.) incluso cuando el popup no está abierto. Es el mecanismo estándar de Chrome para tareas programadas en extensiones Manifest V3.

### `identity`
> **Justificación:** La extensión usa `chrome.identity.getAuthToken()` para obtener tokens OAuth 2.0 de Google de forma segura, sin necesidad de que el usuario ingrese manualmente sus credenciales. Es el método recomendado por Google para que las extensiones de Chrome accedan a las APIs de Google en nombre del usuario.

---

## 5. JUSTIFICACIÓN DEL PERMISO SENSIBLE DE GOOGLE API

### Scope: `https://www.googleapis.com/auth/gmail.readonly`

**Por qué se necesita:**
La extensión necesita leer los correos del usuario para encontrar los adjuntos de DTE. Usamos el scope `gmail.readonly` (solo lectura) en lugar de scopes más amplios porque:
- Solo necesitamos listar y leer mensajes, no enviarlos ni modificarlos.
- El método `messages.list` con filtros (`q=filename:*.json`) y `messages.get` con `format=minimal` permite recuperar únicamente los adjuntos relevantes.
- No accedemos al cuerpo completo de los correos personales.

**Uso mínimo de datos:**
- Solo procesamos correos que contienen archivos adjuntos de tipo `application/json` o `application/pdf` con nombres que corresponden al formato DTE de Hacienda SV.
- Los metadatos del correo (remitente, asunto) se usan únicamente para mostrar información al usuario en el panel de la extensión.
- El contenido de los correos no se almacena ni transmite fuera del dispositivo del usuario.

---

## 6. CATEGORÍA Y ETIQUETAS SUGERIDAS

- **Categoría:** Productivity
- **Etiquetas:** DTE, factura electrónica, El Salvador, Hacienda, Gmail, contabilidad, comprobante fiscal, CCF, CF

---

## 7. INFORMACIÓN DE LA TIENDA

| Campo | Valor |
|---|---|
| URL del sitio web | https://ifactu.jsolutionsv.com |
| Política de privacidad | https://ifactu.jsolutionsv.com/privacidad-extension |
| Soporte / contacto | jsolution.sv@gmail.com |
| Idioma principal | Español |
| Regiones disponibles | Todas (enfocado en El Salvador) |

---

## 8. CHECKLIST DE MATERIALES NECESARIOS

### Imágenes requeridas
- [ ] **Ícono 128×128 px** — ya existe en `icons/icon128.png`
- [ ] **Capturas de pantalla** — entre 1 y 5 imágenes, tamaño 1280×800 px o 640×400 px
  - Screenshot 1: Popup mostrando cuentas de Gmail conectadas con DTEs encontrados
  - Screenshot 2: Popup descargando DTEs (barra de progreso)
  - Screenshot 3: Opciones de licencia — plan activo, DTEs usados del mes
  - Screenshot 4: Opciones — sección de cómo obtener licencia (con tienda)
- [ ] **Imagen promocional pequeña** — 440×280 px (opcional pero recomendada)
  - Texto sugerido: "iFactu_Conta — Descarga tus DTEs desde Gmail automáticamente"
  - Fondo: gradiente oscuro (#0f172a → #1e1b4b), texto blanco

### Pasos para tomar los screenshots
1. Instala la extensión en Chrome en modo desarrollador (cargar extensión sin empaquetar)
2. Conéctate con una cuenta de Gmail que tenga correos con DTE adjuntos
3. Abre el popup y captura con la extensión ScreenCapture o la herramienta de Chrome DevTools
4. Recorta/escala a 1280×800 px con Figma, Photoshop, o cualquier editor

---

## 9. PROCESO DE VERIFICACIÓN OAUTH DE GOOGLE
*(Requerido porque usa gmail.readonly — scope sensible)*

### Pasos en Google Cloud Console
1. Ir a https://console.cloud.google.com
2. Seleccionar el proyecto donde está configurado el OAuth Client ID de la extensión
3. Ir a **APIs & Services → OAuth consent screen**
4. Completar todos los campos:
   - App name: `iFactu_Conta`
   - User support email: `jsolution.sv@gmail.com`
   - App logo: subir `icon128.png`
   - App domain: `https://ifactu.jsolutionsv.com`
   - Privacy policy: `https://ifactu.jsolutionsv.com/privacidad-extension`
   - Authorized domains: `jsolutionsv.com`
5. En **Scopes**, agregar: `https://www.googleapis.com/auth/gmail.readonly`
6. Cambiar el estado de **Testing** a **In production**
7. Hacer clic en **Submit for verification**

### Información para el formulario de verificación
- **¿Por qué necesitas este scope?**
  > "La extensión Chrome iFactu_Conta necesita leer los correos de Gmail del usuario para encontrar y descargar automáticamente los archivos adjuntos de Documentos Tributarios Electrónicos (DTE) emitidos por proveedores. El Salvador implementó la facturación electrónica obligatoria y los contadores reciben decenas de DTEs por correo que deben procesar manualmente. La extensión automatiza este proceso leyendo únicamente los correos con archivos adjuntos JSON/PDF de DTE."

- **¿Cómo usas los datos?**
  > "Los datos de Gmail se usan exclusivamente para: (1) listar correos con adjuntos de DTE usando filtros de búsqueda, (2) descargar los adjuntos al equipo local del usuario. No almacenamos el contenido de los correos en nuestros servidores. Los tokens OAuth son manejados por chrome.identity y nunca son accesibles para nuestros servidores."

- **Demo video (requerido):**
  Grabar un video de 3-5 minutos mostrando:
  1. Instalación de la extensión
  2. Proceso de autenticación con Google
  3. La extensión encontrando y descargando DTEs de Gmail
  4. Los archivos descargados en la carpeta local
  Subir a YouTube (puede ser no listado) o Google Drive

### Tiempo estimado de revisión
- OAuth verification: **4-6 semanas** para scopes sensibles (gmail.readonly)
- Chrome Web Store review: **1-3 días hábiles** después de que pase el OAuth
