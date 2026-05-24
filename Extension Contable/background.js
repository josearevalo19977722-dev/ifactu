import { existeFactura, guardarFactura, guardarError, db } from './db.js';
import {
  autenticarCuenta, getValidToken,
  buscarMensajes, obtenerMensaje, descargarAdjunto,
  parsearAdjuntos, obtenerFechaMensaje,
  base64urlToString, base64urlToBase64,
} from './gmail-api.js';

const API_BASE = 'https://ifactu.jsolutionsv.com/api';

let autopilotActivo = false;
const MAX_PAGINAS_GMAIL = 50; // máximo 5000 mensajes por cuenta

// ── Licencia ──────────────────────────────────────────────────────────────────

async function validarLicencia(forzar = false) {
  const { license_key, license_status } = await chrome.storage.local.get(['license_key', 'license_status']);
  if (!license_key) return { valid: false };

  // Revalidar solo si pasaron más de 24h o si se fuerza
  if (!forzar && license_status?.checkedAt) {
    const horasDesde = (Date.now() - new Date(license_status.checkedAt).getTime()) / 36e5;
    if (horasDesde < 24 && license_status.valid) return license_status;
  }

  try {
    const resp = await fetch(`${API_BASE}/extension/validate?key=${encodeURIComponent(license_key)}`);
    const data = await resp.json();
    const result = { ...data, checkedAt: new Date().toISOString() };
    await chrome.storage.local.set({ license_status: result });
    return result;
  } catch {
    // Sin conexión: usar cache si es reciente (< 7 días)
    if (license_status?.checkedAt) {
      const diasDesde = (Date.now() - new Date(license_status.checkedAt).getTime()) / 864e5;
      if (diasDesde < 7) return { ...license_status, offline: true };
    }
    return { valid: false };
  }
}

// Validar al arrancar
validarLicencia();

// Abrir configuración al instalar por primera vez
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  }
});

// Revalidar cada 24h con alarm
chrome.alarms.create('revalidarLicencia', { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'revalidarLicencia') validarLicencia(true);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'obtenerLicencia') {
    validarLicencia().then(sendResponse);
    return true;
  }
  if (request.action === 'licenciaActualizada') {
    // options.js ya guardó en storage, solo actualizamos cache en memoria
    sendResponse({ ok: true });
    return true;
  }
  if (request.action === 'agregarCuenta') {
    handleAgregarCuenta(sendResponse);
    return true;
  }
  if (request.action === 'eliminarCuenta') {
    handleEliminarCuenta(request.email, sendResponse);
    return true;
  }
  if (request.action === 'obtenerCuentas') {
    handleObtenerCuentas(sendResponse);
    return true;
  }
  if (request.action === 'verificarCuentas') {
    handleVerificarCuentas(sendResponse);
    return true;
  }
  if (request.action === 'iniciarAutopilot') {
    handleIniciarAutopilot(request, sendResponse);
    return true;
  }
  if (request.action === 'detenerAutopilot') {
    autopilotActivo = false;
    sendResponse({ status: 'detenido' });
  }
  if (request.action === 'guardarDeteccionCompleta') {
    handleGuardarDeteccionCompleta(request.data, sendResponse);
    return true;
  }

  // ── Outlook autopilot (desde content-outlook.js) ─────────
  if (request.action === 'autopilotScan') {
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ status: 'error', error: 'No tabId' }); return true; }
    handleAutopilotScanOutlook(tabId, sendResponse);
    return true;
  }
  if (request.action === 'autopilotError') {
    handleAutopilotError(request.url, request.motivo, sendResponse);
    return true;
  }
  if (request.action === 'resetAutopilotStats') {
    chrome.storage.session.set({ ap_revisados: 0, ap_guardados: 0, ap_errores: 0 });
    sendResponse({ ok: true });
    return true;
  }
  if (request.action === 'getAutopilotStats') {
    chrome.storage.session.get(['ap_revisados', 'ap_guardados', 'ap_errores'], (data) => {
      sendResponse({
        revisados: data.ap_revisados || 0,
        guardados: data.ap_guardados || 0,
        errores:   data.ap_errores  || 0,
      });
    });
    return true;
  }
  // Compatibilidad con popup.js legacy
  if (request.action === 'guardarDTEDirecto') {
    handleGuardarDeteccionCompleta(request.data, sendResponse);
    return true;
  }

  return false;
});

// ── Cuenta management ─────────────────────────────────────────────────────────

async function handleAgregarCuenta(sendResponse) {
  try {
    const cuenta = await autenticarCuenta();
    const { cuentas = [] } = await chrome.storage.local.get('cuentas');
    const idx = cuentas.findIndex(c => c.email === cuenta.email);
    if (idx >= 0) cuentas[idx] = cuenta;
    else cuentas.push(cuenta);
    await chrome.storage.local.set({ cuentas });
    sendResponse({ status: 'ok', cuenta: { email: cuenta.email, nombre: cuenta.nombre } });
  } catch (e) {
    sendResponse({ status: 'error', error: e.message });
  }
}

async function handleEliminarCuenta(email, sendResponse) {
  const { cuentas = [] } = await chrome.storage.local.get('cuentas');
  await chrome.storage.local.set({ cuentas: cuentas.filter(c => c.email !== email) });
  sendResponse({ status: 'ok' });
}

async function handleObtenerCuentas(sendResponse) {
  const { cuentas = [] } = await chrome.storage.local.get('cuentas');
  sendResponse({ status: 'ok', cuentas: cuentas.map(c => ({
    email:       c.email,
    nombre:      c.nombre,
    needsReauth: c.needsReauth ?? false,
  })) });
}

/**
 * Verifica el token de cada cuenta sin lanzar el autopilot completo.
 * Actualiza needsReauth en storage y devuelve el estado actualizado.
 * Se llama al abrir el popup para mostrar el estado real de cada cuenta.
 */
async function handleVerificarCuentas(sendResponse) {
  const { cuentas = [] } = await chrome.storage.local.get('cuentas');
  if (!cuentas.length) { sendResponse({ status: 'ok', cuentas: [] }); return; }

  const resultados = [];
  for (const c of cuentas) {
    try {
      // Intenta obtener un token válido — si falla el token está expirado
      await getValidToken(c);
      c.needsReauth = false;
    } catch {
      c.needsReauth = true;
    }
    resultados.push({ email: c.email, nombre: c.nombre, needsReauth: c.needsReauth });
  }

  // Persistir el estado actualizado
  await chrome.storage.local.set({ cuentas });
  sendResponse({ status: 'ok', cuentas: resultados });
}

// ── Autopilot ─────────────────────────────────────────────────────────────────

async function handleIniciarAutopilot(request, sendResponse) {
  if (autopilotActivo) { sendResponse({ status: 'ya-activo' }); return; }

  const { cuentas = [] } = await chrome.storage.local.get('cuentas');
  if (cuentas.length === 0) {
    sendResponse({ status: 'error', error: 'No hay cuentas conectadas. Agrega una cuenta primero.' });
    return;
  }

  sendResponse({ status: 'iniciado' });
  runAutopilot(cuentas, request.desde || null, request.hasta || null);
}

async function runAutopilot(cuentas, desde, hasta) {
  autopilotActivo = true;
  await chrome.storage.session.set({ ap_gmail_active: true });

  let query = 'has:attachment filename:json';
  if (desde) query += ` after:${desde.replace(/-/g, '/')}`;
  if (hasta) {
    const d = new Date(hasta);
    d.setDate(d.getDate() + 1);
    query += ` before:${d.toISOString().slice(0, 10).replace(/-/g, '/')}`;
  }

  let totalGuardados = 0;
  let totalRevisados = 0;

  for (const cuenta of cuentas) {
    if (!autopilotActivo) break;

    reportar({ texto: `Buscando en ${cuenta.email}…`, actual: 0, total: 1 });

    let token;
    try {
      token = await getValidToken(cuenta);
      // Limpiar flag de reconexión si antes fallaba
      await marcarCuentaReconectada(cuenta.email);
    } catch (e) {
      reportar({ texto: `⚠️ ${cuenta.email}: sesión expirada. Reconecta la cuenta.`, actual: 1, total: 1 });
      await marcarCuentaNecesitaReauth(cuenta.email);
      continue;
    }

    // Recopilar todos los IDs con paginación (máximo MAX_PAGINAS_GMAIL)
    const mensajeIds = [];
    let pageToken = null;
    let paginas    = 0;
    do {
      const result = await buscarMensajes(token, query, pageToken).catch(() => ({}));
      if (result.messages) mensajeIds.push(...result.messages.map(m => m.id));
      pageToken = result.nextPageToken || null;
      paginas++;
      if (paginas >= MAX_PAGINAS_GMAIL && pageToken) {
        reportar({ texto: `⚠️ ${cuenta.email}: más de ${mensajeIds.length} correos — limitando búsqueda.`, actual: 1, total: 1 });
        break;
      }
    } while (pageToken && autopilotActivo);

    if (mensajeIds.length === 0) {
      reportar({ texto: `${cuenta.email}: sin correos con adjuntos JSON`, actual: 1, total: 1 });
      continue;
    }

    reportar({ texto: `${cuenta.email}: ${mensajeIds.length} correos encontrados`, actual: 0, total: mensajeIds.length });

    for (let i = 0; i < mensajeIds.length; i++) {
      if (!autopilotActivo) break;

      const msgId = mensajeIds[i];
      totalRevisados++;
      await incrementStat('ap_revisados');
      reportar({ texto: `${cuenta.email}: ${i + 1} / ${mensajeIds.length}`, actual: i, total: mensajeIds.length });

      try {
        const mensaje = await obtenerMensaje(token, msgId);
        const adjuntos = parsearAdjuntos(mensaje);
        const fechaCorreo = obtenerFechaMensaje(mensaje);

        const jsonAdj = adjuntos.find(a => a.filename?.toLowerCase().endsWith('.json'));
        const pdfAdj  = adjuntos.find(a => a.filename?.toLowerCase().endsWith('.pdf'));

        if (!jsonAdj) continue;

        // Descargar JSON
        let jsonContent;
        try {
          const raw = jsonAdj.data
            ? jsonAdj.data
            : jsonAdj.attachmentId
              ? await descargarAdjunto(token, msgId, jsonAdj.attachmentId)
              : null;
          if (!raw) continue;
          jsonContent = JSON.parse(base64urlToString(raw));
        } catch { continue; }

        const id = jsonContent.identificacion?.codigoGeneracion;
        if (!id) continue;
        if (await existeFactura(id)) continue;

        // Descargar PDF (opcional)
        let pdfData = null;
        if (pdfAdj) {
          try {
            const raw = pdfAdj.data
              ? pdfAdj.data
              : pdfAdj.attachmentId
                ? await descargarAdjunto(token, msgId, pdfAdj.attachmentId)
                : null;
            if (raw) pdfData = base64urlToBase64(raw);
          } catch { /* PDF opcional */ }
        }

        await guardarFactura({
          id,
          nit:          jsonContent.emisor?.nit,
          nombre:       jsonContent.emisor?.nombreLegal || jsonContent.emisor?.nombre,
          fechaEmision: jsonContent.identificacion?.fecEmi,
          tipoDte:      jsonContent.identificacion?.tipoDte,
          json:         jsonContent,
          pdf:          pdfData,
          nombresArchivos: { json: jsonAdj.filename, pdf: pdfAdj?.filename || null },
          fechaCorreo,
          cuentaEmail:  cuenta.email,
        });

        registrarUsoBackend(); // fire-and-forget
        totalGuardados++;
        await incrementStat('ap_guardados');
        actualizarBadge();

      } catch (e) {
        console.error(`[AUTOPILOT] Error en mensaje ${msgId}:`, e.message);
        // Registrar error en IndexedDB para log persistente
        try {
          await guardarError({ url: `gmail:${msgId}`, motivo: e.message });
          await incrementStat('ap_errores');
        } catch (_) {}
      }
    }
  }

  autopilotActivo = false;
  await chrome.storage.session.set({ ap_gmail_active: false });
  const texto = `✅ ${totalGuardados} DTEs guardados de ${totalRevisados} revisados`;
  reportar({ texto, actual: totalRevisados, total: totalRevisados });

  if (totalGuardados > 0) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'ifactu-logo.png',
      title: '✅ Autopilot completado',
      message: `${totalGuardados} DTE${totalGuardados !== 1 ? 's' : ''} guardados de ${totalRevisados} correos revisados.`,
    });
  }
}

// ── Guardado directo (compatibilidad con scripts de contenido legacy) ─────────

async function handleGuardarDeteccionCompleta(data, sendResponse) {
  try {
    const { json, pdf, jsonName, pdfName, fechaCorreo } = data;
    const id = json.identificacion?.codigoGeneracion;
    if (!id) throw new Error('Datos incompletos.');
    if (await existeFactura(id)) { sendResponse({ status: 'duplicado' }); return; }

    await guardarFactura({
      id,
      nit:          json.emisor?.nit,
      nombre:       json.emisor?.nombreLegal || json.emisor?.nombre,
      fechaEmision: json.identificacion?.fecEmi,
      tipoDte:      json.identificacion?.tipoDte,
      json, pdf,
      nombresArchivos: { json: jsonName, pdf: pdfName },
      fechaCorreo: fechaCorreo || null,
    });

    registrarUsoBackend(); // fire-and-forget
    const emisor = json.emisor?.nombreLegal || json.emisor?.nombre || 'Factura';
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'ifactu-logo.png',
      title: '✅ Factura Guardada',
      message: `Se ha registrado el DTE de ${emisor}`,
    });

    actualizarBadge();
    sendResponse({ status: 'ok' });
  } catch (error) {
    sendResponse({ status: 'error', error: error.message });
  }
}

// ── Outlook autopilot scan (ejecuta el script en contexto de página) ──────────

async function handleAutopilotScanOutlook(tabId, sendResponse) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      func: async () => {
        function buscarCanary() {
          const cm = document.cookie.match(/(?:X-OWA-CANARY|canary)=([^;]+)/i);
          if (cm) return cm[1];
          for (const store of [sessionStorage, localStorage]) {
            try {
              for (let i = 0; i < store.length; i++) {
                const k = store.key(i);
                if (k?.toLowerCase().includes('canary')) {
                  const v = store.getItem(k);
                  if (v?.length > 10) return v;
                }
              }
            } catch (e) {}
          }
          const cands = [window.g_canaryToken, window.g_caniaryToken, window.g_canary, window.__owa_canary__,
                         window.OWA?.application?.canary, window.OWA?.canary];
          for (const c of cands) if (typeof c === 'string' && c.length > 10) return c;
          for (const k of Object.keys(window)) {
            if (k.toLowerCase().includes('canary')) {
              const v = window[k];
              if (typeof v === 'string' && v.length > 10) return v;
            }
          }
          return null;
        }
        function b64ToBytes(b64) {
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return arr;
        }
        const canary = buscarCanary();
        if (!canary) return { error: 'canary_no_encontrado' };
        const m = window.location.pathname.match(/\/mail\/([^?#/]+)/);
        if (!m) return { error: 'sin_correo_abierto' };
        const msgId = decodeURIComponent(m[1]);
        const hdrs = (a) => ({
          'Content-Type': 'application/json; charset=utf-8',
          'X-OWA-CANARY': canary, 'Action': a
        });
        const itemR = await fetch('/owa/service.svc/s/GetItem', {
          method: 'POST', credentials: 'include', headers: hdrs('GetItem'),
          body: JSON.stringify({ request: {
            __type: 'GetItemRequest:#Exchange',
            ItemShape: { __type: 'ItemResponseShapeType:#Exchange', BaseShape: 'IdOnly',
              AdditionalProperties: [{ __type: 'PropertyUri:#Exchange', FieldURI: 'item:Attachments' }] },
            ItemIds: [{ __type: 'ItemId:#Exchange', Id: msgId }]
          }})
        });
        if (!itemR.ok) return { error: `owa_${itemR.status}` };
        const itemData = await itemR.json();
        const adjuntos = itemData?.Body?.ResponseMessages?.[0]?.Items?.[0]?.Attachments || [];
        if (!adjuntos.length) return { error: 'sin_adjuntos' };
        const archivos = [];
        for (const adj of adjuntos) {
          const attId = adj.AttachmentId?.Id; if (!attId) continue;
          const attR = await fetch('/owa/service.svc/s/GetAttachment', {
            method: 'POST', credentials: 'include', headers: hdrs('GetAttachment'),
            body: JSON.stringify({ request: {
              __type: 'GetAttachmentRequest:#Exchange',
              AttachmentShape: { __type: 'AttachmentResponseShapeType:#Exchange', IncludeMimeContent: true },
              AttachmentIds: [{ __type: 'RequestAttachmentId:#Exchange', Id: attId }]
            }})
          });
          if (!attR.ok) continue;
          const attData = await attR.json();
          const content = attData?.Body?.ResponseMessages?.[0]?.Attachments?.[0]?.Content;
          if (content) archivos.push({ nombre: adj.Name || '', size: adj.Size || 0, content });
        }
        if (!archivos.length) return { error: 'sin_adjuntos' };
        return { ok: true, archivos };
      }
    });

    const sr = results?.[0]?.result;
    await incrementStat('ap_revisados');

    if (!sr) { sendResponse({ status: 'error', error: 'sin_respuesta_script' }); return; }
    if (['sin_adjuntos', 'sin_correo_abierto'].includes(sr.error)) {
      sendResponse({ status: 'sin_adjuntos' }); return;
    }
    if (!sr.ok) { sendResponse({ status: 'error', error: sr.error }); return; }

    // Identificar JSON DTE y PDF
    const { archivos } = sr;
    let jsonData = null, pdfB64 = null;
    for (const arch of archivos) {
      const nb = arch.nombre.toLowerCase();
      const bytes = b64ToBytesLocal(arch.content);
      if (nb.endsWith('.pdf') || (bytes[0] === 0x25 && bytes[1] === 0x50)) {
        pdfB64 = arch.content; continue;
      }
      try {
        const json = JSON.parse(new TextDecoder().decode(bytes));
        if (json?.identificacion?.codigoGeneracion) { jsonData = json; continue; }
      } catch (e) {}
    }
    if (!jsonData && archivos.length >= 2) {
      const sorted = [...archivos].sort((a, b) => a.size - b.size);
      try { jsonData = JSON.parse(new TextDecoder().decode(b64ToBytesLocal(sorted[0].content))); } catch (e) {}
      if (!pdfB64) pdfB64 = sorted[sorted.length - 1].content;
    }
    if (!jsonData) { sendResponse({ status: 'sin_adjuntos' }); return; }

    const id = jsonData?.identificacion?.codigoGeneracion;
    if (!id) { sendResponse({ status: 'error', error: 'json_sin_codigo' }); return; }
    if (await existeFactura(id)) { sendResponse({ status: 'duplicado' }); return; }

    await guardarFactura({
      id,
      nit:          jsonData.emisor?.nit,
      nombre:       jsonData.emisor?.nombreLegal || jsonData.emisor?.nombre,
      fechaEmision: jsonData.identificacion?.fecEmi,
      tipoDte:      jsonData.identificacion?.tipoDte,
      json:         jsonData,
      pdf:          pdfB64 || null
    });

    registrarUsoBackend(); // fire-and-forget
    await incrementStat('ap_guardados');
    const empresa = jsonData.emisor?.nombreLegal || jsonData.emisor?.nombre || 'Desconocido';
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png',
      title: '✅ DTE Guardado', message: `Factura de ${empresa} guardada.`
    });
    actualizarBadge();
    sendResponse({ status: 'ok' });

  } catch (error) {
    console.error('[background] autopilotScan Outlook error:', error);
    sendResponse({ status: 'error', error: error.message });
  }
}

// ── Registrar error del autopilot en IndexedDB ────────────────────────────────

async function handleAutopilotError(url, motivo, sendResponse) {
  try {
    await guardarError({ url: url || 'desconocido', motivo: motivo || 'Error' });
    await incrementStat('ap_errores');
    if (sendResponse) sendResponse({ ok: true });
  } catch (e) {
    console.error('[background] Error guardando log:', e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function reportar(datos) {
  chrome.runtime.sendMessage({ action: 'progresoAutopilot', ...datos }).catch(() => {});
}

async function incrementStat(key) {
  const data = await chrome.storage.session.get(key);
  await chrome.storage.session.set({ [key]: (data[key] || 0) + 1 });
}

function b64ToBytesLocal(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function actualizarBadge() {
  try {
    const count = await db.facturas.count();
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  } catch (e) { console.error(e); }
}

// ── Registrar uso de DTE en el backend (para control de límites del plan) ─────
async function registrarUsoBackend() {
  try {
    const { license_key, device_fingerprint } = await chrome.storage.local.get(['license_key', 'device_fingerprint']);
    if (!license_key) return;
    await fetch(`${API_BASE}/licencias/registrar-uso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clave: license_key, fingerprint: device_fingerprint || 'extension', cantidad: 1 }),
    });
  } catch { /* no crítico — el DTE ya se guardó localmente */ }
}

// ── Marcar cuenta Gmail como que necesita reconexión ─────────────────────────
async function marcarCuentaNecesitaReauth(email) {
  const { cuentas = [] } = await chrome.storage.local.get('cuentas');
  const idx = cuentas.findIndex(c => c.email === email);
  if (idx >= 0) { cuentas[idx].needsReauth = true; await chrome.storage.local.set({ cuentas }); }
}

async function marcarCuentaReconectada(email) {
  const { cuentas = [] } = await chrome.storage.local.get('cuentas');
  const idx = cuentas.findIndex(c => c.email === email);
  if (idx >= 0 && cuentas[idx].needsReauth) {
    cuentas[idx].needsReauth = false;
    await chrome.storage.local.set({ cuentas });
  }
}
