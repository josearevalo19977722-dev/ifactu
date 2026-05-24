import {
  db, obtenerFacturas, vaciarBaseDeDatos,
  obtenerFacturasRecientes, contarEmpresas,
  obtenerErrores, contarErrores, limpiarErrores
} from './db.js';

// ── Validación de licencia ────────────────────────────────────────────────────
(async () => {
  const gate      = document.getElementById('license-gate');
  const appContent = document.getElementById('app-content');
  const gateStatus = document.getElementById('gate-status');

  const lic = await new Promise(resolve =>
    chrome.runtime.sendMessage({ action: 'obtenerLicencia' }, r => resolve(r ?? { valid: false }))
  );

  if (lic.valid) {
    gate.style.display = 'none';
    appContent.style.display = 'block';

    // Barra de uso de DTEs del mes (solo si el plan tiene límite)
    if (lic.max_dtes_mes) {
      const usado  = lic.dtes_usados_mes || 0;
      const maximo = lic.max_dtes_mes;
      const pct    = Math.min(100, Math.round((usado / maximo) * 100));
      if (usageBarWrap)  usageBarWrap.classList.add('visible');
      if (usageCountEl)  usageCountEl.textContent = `${usado} / ${maximo} DTEs`;
      if (usageFillEl) {
        usageFillEl.style.width = pct + '%';
        usageFillEl.className   = 'usage-fill' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
      }
    }

    // Banner si la licencia vence pronto (≤ 7 días)
    if (lic.fecha_fin) {
      const diasRestantes = Math.ceil((new Date(lic.fecha_fin) - Date.now()) / 864e5);
      if (diasRestantes <= 7 && diasRestantes >= 0) {
        const banner = document.getElementById('expiry-banner');
        const msg    = document.getElementById('expiry-msg');
        if (banner && msg) {
          msg.textContent = diasRestantes === 0
            ? '⚠️ Tu licencia vence hoy. Renuévala para no perder el acceso.'
            : `⚠️ Tu licencia vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}. Renuévala pronto.`;
          banner.classList.add('visible');
        }
      }
    }
  } else {
    appContent.style.display = 'none';
    gate.style.display       = 'flex';
    if (!lic.valid && gateStatus) {
      gateStatus.textContent = 'Sin licencia válida. Ingresa tu clave en configuración.';
    }
    document.getElementById('gate-settings-btn')?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    return; // No inicializar el resto del popup
  }
})();

// ── Librerías globales (cargadas antes de este módulo) ─────
const JSZip = window.JSZip;
const XLSX  = window.XLSX;

// ── Referencias DOM ────────────────────────────────────────
const zipBtn          = document.getElementById('zip-btn');
const csvBtn          = document.getElementById('csv-btn');
const xlBtn           = document.getElementById('xl-btn');
const statusEl        = document.getElementById('status');
const totalCountEl    = document.getElementById('total-count');
const totalEmpresasEl = document.getElementById('total-empresas');
const autopilotBtn    = document.getElementById('autopilot-btn');
const progressWrap    = document.getElementById('progress-wrap');
const progressBar     = document.getElementById('progress-bar');
const progressLabel   = document.getElementById('progress-label');
const invoiceListEl   = document.getElementById('invoice-list');
const modalOverlay    = document.getElementById('modal-overlay');
const modalCancel     = document.getElementById('modal-cancel');
const modalConfirm    = document.getElementById('modal-confirm');
const clearDbBtn      = document.getElementById('clear-db-btn');
const addAccountBtn   = document.getElementById('add-account-btn');
const accountsListEl  = document.getElementById('accounts-list');
const fechaDesdeEl    = document.getElementById('fecha-desde');
const fechaHastaEl    = document.getElementById('fecha-hasta');
const apStatsEl       = document.getElementById('ap-stats');
const apRevisadosEl   = document.getElementById('ap-revisados');
const apGuardadosEl   = document.getElementById('ap-guardados');
const apErroresEl     = document.getElementById('ap-errores');

// Búsqueda / filtro
const searchInputEl   = document.getElementById('search-input');
const tipoFilterEl    = document.getElementById('tipo-filter');
const listDividerEl   = document.getElementById('list-divider');
const listDesdeEl     = document.getElementById('list-desde');
const listHastaEl     = document.getElementById('list-hasta');

// Barra de uso mensual
const usageBarWrap    = document.getElementById('usage-bar-wrap');
const usageCountEl    = document.getElementById('usage-count');
const usageFillEl     = document.getElementById('usage-fill');

// Log de errores
const errorLogToggle  = document.getElementById('error-log-toggle');
const errorLogEl      = document.getElementById('error-log');
const errorLogLabel   = document.getElementById('error-log-label');

// Modal detalle
const detailOverlay   = document.getElementById('detail-overlay');
const detailClose     = document.getElementById('detail-close');
const detailTitleEl   = document.getElementById('detail-title');
const detailBodyEl    = document.getElementById('detail-body');
const detailJsonBtn   = document.getElementById('detail-json-btn');
const detailPdfBtn    = document.getElementById('detail-pdf-btn');

// ── Estado local ───────────────────────────────────────────
let autopilotActivo    = false;
let statsInterval      = null;
let todasLasFacturas   = [];   // cache para búsqueda client-side

// ── Init ───────────────────────────────────────────────────
actualizarEstado();
cargarCuentas();
restaurarEstadoAutopilot();

// Búsqueda / filtro
searchInputEl?.addEventListener('input',  aplicarFiltro);
tipoFilterEl?.addEventListener('change',  aplicarFiltro);
listDesdeEl?.addEventListener('change',   aplicarFiltro);
listHastaEl?.addEventListener('change',   aplicarFiltro);

// Log de errores (toggle)
const clearErrorsBtn = document.getElementById('clear-errors-btn');

async function renderizarErrores() {
  const errores = await obtenerErrores(30);
  if (!errores.length) {
    errorLogEl.innerHTML = '<div style="font-size:0.67rem;color:var(--text-dim);padding:4px 2px;">Sin errores registrados ✓</div>';
    if (clearErrorsBtn) clearErrorsBtn.style.display = 'none';
  } else {
    errorLogEl.innerHTML = errores.map(e => `
      <div class="error-item">
        <div>${e.motivo || 'Error desconocido'}</div>
        <div class="err-url">${e.url || ''}</div>
        <div class="err-fecha">${e.fechaError ? new Date(e.fechaError).toLocaleString('es-SV') : ''}</div>
      </div>`).join('');
    if (clearErrorsBtn) clearErrorsBtn.style.display = '';
  }
}

errorLogToggle?.addEventListener('click', async () => {
  const abierto = errorLogEl.classList.toggle('open');
  if (abierto) {
    errorLogLabel.textContent = 'Ocultar log de errores';
    await renderizarErrores();
  } else {
    errorLogLabel.textContent = 'Ver log de errores';
    if (clearErrorsBtn) clearErrorsBtn.style.display = 'none';
  }
});

clearErrorsBtn?.addEventListener('click', async () => {
  await limpiarErrores();
  await renderizarErrores();
});

// Modal detalle
detailClose?.addEventListener('click', () => detailOverlay.classList.remove('open'));
detailOverlay?.addEventListener('click', e => {
  if (e.target === detailOverlay) detailOverlay.classList.remove('open');
});

// Escuchar progreso del autopilot Gmail (desde background.js)
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'progresoAutopilot') {
    if (request.texto) setStatus(request.texto);
    if (request.total > 0) {
      setProgress(Math.round((request.actual / request.total) * 100), request.texto);
    }
    if (request.actual >= request.total && request.total > 0) {
      setTimeout(() => setProgress(null), 2000);
      restaurarBtnAutopilot();
      actualizarEstado();
    }
  }
});

// ── Restaurar estado del autopilot al reabrir popup ────────
async function restaurarEstadoAutopilot() {
  const sess = await chrome.storage.session.get(['ap_outlook_active', 'ap_gmail_active']);
  if (sess.ap_outlook_active || sess.ap_gmail_active) {
    autopilotActivo = true;
    setBtnAutopilotActivo(true);
    iniciarPollingStats();
    setStatus(sess.ap_gmail_active ? 'Autopilot Gmail en curso…' : 'Autopilot Outlook en curso…');
  }
}

// ── Cuentas Gmail ──────────────────────────────────────────
async function cargarCuentas() {
  const resp = await msgBg({ action: 'obtenerCuentas' });
  renderizarCuentas(resp?.cuentas || []);

  // Verificar tokens en background (silencioso, actualiza el estado sin bloquear UI)
  if ((resp?.cuentas || []).length > 0) {
    msgBg({ action: 'verificarCuentas' }).then(r => {
      if (r?.cuentas) renderizarCuentas(r.cuentas);
    }).catch(() => {});
  }
}

function renderizarCuentas(cuentas, verificando = false) {
  if (!accountsListEl) return;
  if (!cuentas.length) {
    accountsListEl.innerHTML = '<div class="empty-state">Sin cuentas conectadas</div>';
    return;
  }
  accountsListEl.innerHTML = cuentas.map(c => {
    const inicial  = (c.nombre || c.email || '?')[0].toUpperCase();
    const reauth   = c.needsReauth;
    // Estado visual: rojo=expirada, verde=ok, gris=desconocido (primera carga)
    const estadoColor = reauth === true  ? '#ef4444'
                      : reauth === false ? '#10b981'
                      : '#94a3b8';
    const estadoTexto = reauth === true  ? '⚠️ Sesión expirada — toca para reconectar'
                      : reauth === false ? '✅ Conectada'
                      : '⏳ Verificando…';
    const avatarBg = reauth === true
      ? 'background:linear-gradient(135deg,#dc2626,#ef4444)'
      : 'background:linear-gradient(135deg,var(--primary),#818cf8)';
    return `
      <div class="acc-item">
        <div class="acc-avatar" style="${avatarBg}">${reauth === true ? '⚠' : inicial}</div>
        <div class="acc-info">
          <div class="acc-email">${c.email}</div>
          <div class="acc-sub" style="color:${estadoColor};font-size:10px;">${estadoTexto}</div>
        </div>
        ${reauth === true
          ? `<button class="acc-remove acc-reauth" data-email="${c.email}" title="Reconectar cuenta"
               style="color:#f87171;border-color:rgba(239,68,68,0.3);">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
             </button>`
          : `<button class="acc-remove" data-email="${c.email}" title="Quitar cuenta">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                 <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
               </svg>
             </button>`}
      </div>`;
  }).join('');

  accountsListEl.querySelectorAll('.acc-remove:not(.acc-reauth)').forEach(btn => {
    btn.addEventListener('click', async () => {
      await msgBg({ action: 'eliminarCuenta', email: btn.dataset.email });
      cargarCuentas();
    });
  });

  // Botón de reconexión para cuentas con sesión expirada
  accountsListEl.querySelectorAll('.acc-reauth').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      setStatus(`Reconectando ${btn.dataset.email}…`);
      // Eliminar y volver a agregar la cuenta para forzar re-auth
      await msgBg({ action: 'eliminarCuenta', email: btn.dataset.email });
      const resp = await msgBg({ action: 'agregarCuenta' });
      if (resp?.status === 'ok') {
        setStatus(`✅ ${resp.cuenta.email} reconectada.`);
        cargarCuentas();
      } else {
        setStatus(`Error: ${resp?.error || 'No se pudo reconectar'}`);
        cargarCuentas();
      }
    });
  });
}

if (addAccountBtn) {
  addAccountBtn.addEventListener('click', async () => {
    addAccountBtn.disabled = true;
    setStatus('Autenticando cuenta…');
    const resp = await msgBg({ action: 'agregarCuenta' });
    addAccountBtn.disabled = false;
    if (resp?.status === 'ok') {
      setStatus(`✅ Cuenta ${resp.cuenta.email} agregada.`);
      cargarCuentas();
    } else {
      setStatus(`Error: ${resp?.error || 'desconocido'}`);
    }
  });
}

// ── Autopilot (Gmail + Outlook unificado) ─────────────────
if (autopilotBtn) {
  autopilotBtn.addEventListener('click', async () => {
    if (autopilotActivo) {
      await detenerAutopilot();
    } else {
      await iniciarAutopilot();
    }
  });
}

async function iniciarAutopilot() {
  const tabs        = await chrome.tabs.query({ active: true, currentWindow: true });
  const url         = tabs[0]?.url || '';
  const cuentasResp = await msgBg({ action: 'obtenerCuentas' });
  const hasCuentas  = (cuentasResp?.cuentas?.length ?? 0) > 0;

  autopilotActivo = true;
  setBtnAutopilotActivo(true);
  await msgBg({ action: 'resetAutopilotStats' });
  iniciarPollingStats();

  if (hasCuentas) {
    // ── Gmail API: no necesita estar en la pestaña de Gmail ──
    const desde = fechaDesdeEl?.value || null;
    const hasta = fechaHastaEl?.value || null;
    setStatus('Autopilot Gmail activo…');
    setProgress(0, 'Iniciando búsqueda…');
    const resp = await msgBg({ action: 'iniciarAutopilot', desde, hasta });
    if (resp?.status === 'error') {
      setStatus(`Error: ${resp.error}`);
      restaurarBtnAutopilot();
    }

  } else if (url.includes('outlook.live.com') || url.includes('outlook.office.com')) {
    // ── Outlook: autopilot via content script ────────────────
    setStatus('Autopilot Outlook activo. Navegando correos…');
    chrome.tabs.sendMessage(tabs[0].id, { action: 'startAutopilot' }).catch(() => {
      setStatus('No se pudo contactar con la pestaña de Outlook. Recarga la página.');
      restaurarBtnAutopilot();
    });

  } else {
    // Sin cuentas y sin pestaña de Outlook
    setStatus('Agrega una cuenta Gmail o abre Outlook para usar el autopilot.');
    restaurarBtnAutopilot();
  }
}

async function detenerAutopilot() {
  autopilotActivo = false;
  setBtnAutopilotActivo(false);
  detenerPollingStats();
  setProgress(null);
  setStatus('Autopilot detenido.');

  // Detener Gmail autopilot en background
  msgBg({ action: 'detenerAutopilot' }).catch(() => {});

  // Detener Outlook autopilot en content script
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'stopAutopilot' }).catch(() => {});
  }
  chrome.storage.session.set({ ap_outlook_active: false });
  await actualizarEstado();
}

function setBtnAutopilotActivo(activo) {
  if (!autopilotBtn) return;
  if (activo) {
    autopilotBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
      </svg>
      Detener Autopilot`;
    autopilotBtn.classList.add('stopping');
    apStatsEl?.classList.add('visible');
  } else {
    autopilotBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Iniciar Autopilot`;
    autopilotBtn.classList.remove('stopping');
    apStatsEl?.classList.remove('visible');
  }
}

function restaurarBtnAutopilot() {
  autopilotActivo = false;
  setBtnAutopilotActivo(false);
  detenerPollingStats();
}

// ── Polling de stats del autopilot ────────────────────────
function iniciarPollingStats() {
  if (statsInterval) return;
  let ultimosGuardados = 0;
  statsInterval = setInterval(async () => {
    const resp = await msgBg({ action: 'getAutopilotStats' });
    if (!resp) return;
    if (apRevisadosEl) apRevisadosEl.textContent = resp.revisados;
    if (apGuardadosEl) apGuardadosEl.textContent = resp.guardados;
    if (apErroresEl)   apErroresEl.textContent   = resp.errores;
    // Refrescar lista solo cuando hay DTEs nuevos (evita recargar todo cada 2s)
    if (resp.guardados > ultimosGuardados) {
      ultimosGuardados = resp.guardados;
      actualizarEstado();
    }
  }, 2000);
}

function detenerPollingStats() {
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
}

// ── Helper: descarga con revocación automática de blob URL ─────────────────────
function descargarBlob(blob, filename, saveAs = true) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

// ── Obtener lista a exportar (filtrada si hay filtro activo) ───────────────────
function facturasParaExportar() {
  const texto = (searchInputEl?.value || '').trim().toLowerCase();
  const tipo  = tipoFilterEl?.value || '';
  const desde = listDesdeEl?.value || '';
  const hasta = listHastaEl?.value || '';
  const hayFiltro = texto || tipo || desde || hasta;
  if (!hayFiltro) return null; // null = exportar todo
  return todasLasFacturas.filter(f => {
    const matchTexto = !texto ||
      (f.nombre || '').toLowerCase().includes(texto) ||
      (f.nit    || '').includes(texto);
    const matchTipo  = !tipo  || f.tipoDte === tipo;
    const matchDesde = !desde || (f.fechaEmision || '') >= desde;
    const matchHasta = !hasta || (f.fechaEmision || '') <= hasta;
    return matchTexto && matchTipo && matchDesde && matchHasta;
  });
}

// ── ZIP Export ─────────────────────────────────────────────
zipBtn.addEventListener('click', async () => {
  setButtonsDisabled(true);
  setProgress(0, 'Cargando facturas…');
  try {
    const filtradas = facturasParaExportar();
    const facturas  = filtradas ?? await obtenerFacturas();
    if (!facturas.length) { setStatus('No hay facturas para descargar.'); setProgress(null); return; }
    const zip = new JSZip();
    for (let i = 0; i < facturas.length; i++) {
      const f = facturas[i];
      setProgress(Math.round(((i + 1) / facturas.length) * 80), `Empaquetando ${i + 1} / ${facturas.length}…`);
      const limpiar = s => (s || '').replace(/[/\\?%*:|"<>]/g, '-').trim().slice(0, 60);
      const emisor   = f.json?.emisor;
      const receptor = f.json?.receptor;
      const emisorKey   = limpiar(`${emisor?.nit || f.nit || 'S_NIT'} - ${emisor?.nombreLegal || emisor?.nombre || f.nombre || 'S_EMISOR'}`);
      const receptorKey = limpiar(`${receptor?.nit || receptor?.numDocumento || 'S_NIT'} - ${receptor?.nombre || receptor?.nombreComercial || 'S_RECEPTOR'}`);
      const folder = zip.folder(emisorKey).folder(receptorKey);
      if (f.json) folder.file(`${f.id}.json`, JSON.stringify(f.json, null, 2));
      if (f.pdf) {
        try { folder.file(`${f.id}.pdf`, b64toBlob(normalizarBase64(f.pdf), 'application/pdf')); }
        catch (e) { console.error(`PDF corrupto, omitiendo ${f.id}:`, e); }
      }
    }
    setProgress(85, 'Comprimiendo…');
    const content = await zip.generateAsync({ type: 'blob' }, (m) =>
      setProgress(85 + Math.round(m.percent * 0.14), 'Comprimiendo…')
    );
    setProgress(100, '¡Listo!');
    const sufijo = facturasParaExportar() ? '_filtrado' : '';
    descargarBlob(content, `Facturas_Contables${sufijo}_${fechaHoy()}.zip`);
    setTimeout(() => setProgress(null), 1800);
  } catch (e) {
    console.error(e); setStatus('Error al generar ZIP.'); setProgress(null);
  } finally { setButtonsDisabled(false); }
});

// ── CSV Export ─────────────────────────────────────────────
csvBtn.addEventListener('click', async () => {
  setButtonsDisabled(true);
  setStatus('Generando CSV…');
  try {
    const filtradas = facturasParaExportar();
    const facturas  = filtradas ?? await obtenerFacturas();
    if (!facturas.length) { setStatus('No hay facturas para exportar.'); return; }
    const cabeceras = ['ID', 'NIT Emisor', 'Emisor', 'NIT Receptor', 'Receptor', 'Tipo DTE', 'Fecha Emisión', 'Fecha Descarga', 'Cuenta Gmail', 'Estado'];
    const filas = facturas.map(f => {
      const rec = f.json?.receptor || {};
      return [
        f.id ?? '',
        f.nit ?? '',
        f.nombre ?? '',
        rec.nit || rec.numDocumento || '',
        rec.nombre || rec.nombreComercial || '',
        tipoDteLabel(f.tipoDte),
        f.fechaEmision ?? '',
        f.fechaDescarga ? f.fechaDescarga.split('T')[0] : '',
        f.cuentaEmail || '',
        f.estado ?? '',
      ];
    });
    const csv = [cabeceras, ...filas]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const sufijoCsv = filtradas ? '_filtrado' : '';
    descargarBlob(
      new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
      `Facturas_Contables${sufijoCsv}_${fechaHoy()}.csv`
    );
    setStatus(`CSV exportado (${facturas.length} registros).`);
  } catch (e) {
    console.error(e); setStatus('Error al exportar CSV.');
  } finally { setButtonsDisabled(false); }
});

// ── Excel Export (.xlsx) ───────────────────────────────────
xlBtn.addEventListener('click', async () => {
  if (!XLSX) { setStatus('Librería XLSX no disponible. Recarga la extensión.'); return; }
  setButtonsDisabled(true);
  setStatus('Generando Excel…');
  try {
    const filtradas = facturasParaExportar();
    const facturas  = filtradas ?? await obtenerFacturas();
    if (!facturas.length) { setStatus('No hay facturas para exportar.'); return; }

    // ── Hoja principal: todas las facturas ──────────────
    const cabeceras = ['ID / Código', 'NIT Emisor', 'Empresa Emisora',
                       'NIT Receptor', 'Receptor', 'Tipo DTE',
                       'Fecha Emisión', 'Fecha Descarga', 'Cuenta Gmail', 'Estado'];
    const filas = facturas.map(f => {
      const rec = f.json?.receptor || {};
      return [
        f.id            ?? '',
        f.nit           ?? '',
        f.nombre        ?? '',
        rec.nit || rec.numDocumento || '',
        rec.nombre || rec.nombreComercial || '',
        tipoDteLabel(f.tipoDte),
        f.fechaEmision  ?? '',
        f.fechaDescarga ? f.fechaDescarga.split('T')[0] : '',
        f.cuentaEmail   || '',
        f.estado        ?? '',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([cabeceras, ...filas]);
    ws['!cols']   = [{ wch: 40 }, { wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 32 },
                     { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 12 }];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // ── Hoja de resumen por empresa ─────────────────────
    const empresas = {};
    facturas.forEach(f => {
      const k = f.nit || 'S/NIT';
      if (!empresas[k]) empresas[k] = { nombre: f.nombre || 'Desconocido', total: 0 };
      empresas[k].total++;
    });
    const wsResumen = XLSX.utils.aoa_to_sheet([
      ['NIT', 'Empresa', 'Cantidad de DTEs'],
      ...Object.entries(empresas).map(([nit, v]) => [nit, v.nombre, v.total])
    ]);
    wsResumen['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen por empresa');

    const arr      = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob     = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const sufijoXl = filtradas ? '_filtrado' : '';
    descargarBlob(blob, `Facturas_Contables${sufijoXl}_${fechaHoy()}.xlsx`);
    setStatus(`Excel exportado (${facturas.length} registros · ${Object.keys(empresas).length} empresas).`);
  } catch (e) {
    console.error(e); setStatus('Error al exportar Excel.');
  } finally { setButtonsDisabled(false); }
});

// ── Modal (Vaciar BD) ──────────────────────────────────────
clearDbBtn.addEventListener('click', () => modalOverlay.classList.add('open'));
modalCancel.addEventListener('click', () => modalOverlay.classList.remove('open'));
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('open');
});
modalConfirm.addEventListener('click', async () => {
  modalOverlay.classList.remove('open');
  await vaciarBaseDeDatos();
  setStatus('Base de datos vaciada.');
  await actualizarEstado();
});

// ── Estado ─────────────────────────────────────────────────
async function actualizarEstado() {
  const [count, empresas, todas] = await Promise.all([
    db.facturas.count(),
    contarEmpresas(),
    obtenerFacturas(),
  ]);
  totalCountEl.textContent    = count;
  totalEmpresasEl.textContent = empresas;
  // Ordenar por fecha descarga descendente
  todasLasFacturas = todas.sort((a, b) =>
    (b.fechaDescarga || '').localeCompare(a.fechaDescarga || '')
  );
  aplicarFiltro();
  actualizarBadge(count);
}

function aplicarFiltro() {
  const texto = (searchInputEl?.value || '').trim().toLowerCase();
  const tipo  = tipoFilterEl?.value || '';
  const desde = listDesdeEl?.value || '';
  const hasta = listHastaEl?.value || '';

  const filtradas = todasLasFacturas.filter(f => {
    const matchTexto = !texto ||
      (f.nombre || '').toLowerCase().includes(texto) ||
      (f.nit    || '').includes(texto) ||
      (f.json?.receptor?.nombre || '').toLowerCase().includes(texto) ||
      (f.json?.receptor?.nit    || f.json?.receptor?.numDocumento || '').includes(texto);
    const matchTipo  = !tipo  || f.tipoDte === tipo;
    const matchDesde = !desde || (f.fechaEmision || '') >= desde;
    const matchHasta = !hasta || (f.fechaEmision || '') <= hasta;
    return matchTexto && matchTipo && matchDesde && matchHasta;
  });

  // Sin filtros → últimas 5; con filtros → hasta 30
  const hayFiltro = texto || tipo || desde || hasta;
  const limite    = hayFiltro ? 30 : 5;
  renderizarLista(filtradas.slice(0, limite));

  if (listDividerEl) {
    listDividerEl.textContent = hayFiltro
      ? `${filtradas.length} resultado${filtradas.length !== 1 ? 's' : ''}`
      : 'Facturas recientes';
  }
}

function renderizarLista(facturas) {
  if (!facturas.length) {
    invoiceListEl.innerHTML = '<div class="empty-state">No hay facturas guardadas aún</div>';
    return;
  }
  invoiceListEl.innerHTML = facturas.map(f => {
    const empresa = f.nombre || f.nit || 'Desconocido';
    const fecha   = f.fechaEmision || (f.fechaDescarga ? f.fechaDescarga.split('T')[0] : '—');
    const esc     = s => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `
      <div class="invoice-item" data-id="${esc(f.id)}" title="Clic para ver detalle">
        <div class="i-avatar">🧾</div>
        <div class="i-info">
          <div class="i-empresa" title="${esc(empresa)}">${esc(empresa)}</div>
          <div class="i-fecha">${esc(fecha)}</div>
        </div>
        <div class="i-badge">${tipoDteLabel(f.tipoDte)}</div>
      </div>`;
  }).join('');

  invoiceListEl.querySelectorAll('.invoice-item').forEach(el => {
    el.addEventListener('click', () => abrirDetalle(el.dataset.id));
  });
}

// ── Detalle de factura ──────────────────────────────────────
async function abrirDetalle(id) {
  const factura = todasLasFacturas.find(f => f.id === id);
  if (!factura) return;

  const json     = factura.json || {};
  const emisor   = json.emisor   || {};
  const receptor = json.receptor || {};

  detailTitleEl.textContent = `${tipoDteLabel(factura.tipoDte)} · ${emisor.nombreLegal || emisor.nombre || factura.nombre || ''}`;

  const fila = (k, v) => v
    ? `<div class="detail-row"><span class="dk">${k}</span><span class="dv">${String(v).replace(/</g,'&lt;')}</span></div>`
    : '';

  detailBodyEl.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">📤 Emisor</div>
      ${fila('Nombre', emisor.nombreLegal || emisor.nombre || factura.nombre)}
      ${fila('NIT', emisor.nit || factura.nit)}
      ${fila('Dirección', emisor.direccion?.complemento)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">📥 Receptor</div>
      ${fila('Nombre', receptor.nombre || receptor.nombreComercial)}
      ${fila('NIT / Doc', receptor.nit || receptor.numDocumento)}
      ${fila('Correo', receptor.correo)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">📄 Identificación</div>
      ${fila('Tipo', tipoDteLabel(factura.tipoDte))}
      ${fila('Código', factura.id)}
      ${fila('Fecha emisión', factura.fechaEmision)}
      ${fila('Fecha descarga', factura.fechaDescarga ? factura.fechaDescarga.split('T')[0] : null)}
      ${fila('Cuenta Gmail', factura.cuentaEmail)}
      ${fila('Correo origen', factura.fechaCorreo ? new Date(factura.fechaCorreo).toLocaleDateString('es-SV') : null)}
    </div>
  `;

  // Botón JSON
  detailJsonBtn.onclick = () => {
    descargarBlob(
      new Blob([JSON.stringify(factura.json, null, 2)], { type: 'application/json' }),
      `${factura.id}.json`, false
    );
  };

  // Botón PDF
  if (factura.pdf) {
    detailPdfBtn.style.display = '';
    detailPdfBtn.onclick = () => {
      try {
        descargarBlob(b64toBlob(normalizarBase64(factura.pdf), 'application/pdf'), `${factura.id}.pdf`, false);
      } catch (e) { setStatus('Error al abrir PDF.'); }
    };
  } else {
    detailPdfBtn.style.display = 'none';
  }

  detailOverlay.classList.add('open');
}

function actualizarBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
}

// ── Helpers ────────────────────────────────────────────────
function tipoDteLabel(tipo) {
  const mapa = { '01': 'Factura', '03': 'CCF', '05': 'N.Crd', '06': 'N.Dbt', '11': 'Fex', '14': 'Ret' };
  return mapa[tipo] || tipo || 'DTE';
}
function fechaHoy() { return new Date().toISOString().split('T')[0]; }
function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

function setProgress(pct, label) {
  if (pct === null) { progressWrap.classList.remove('visible'); return; }
  progressWrap.classList.add('visible');
  progressBar.style.width   = pct + '%';
  progressLabel.textContent = label || '';
}

function setButtonsDisabled(d) {
  zipBtn.disabled = d;
  csvBtn.disabled = d;
  if (xlBtn) xlBtn.disabled = d;
}

function normalizarBase64(str) {
  const base = str.includes(',') ? str.split(',')[1] : str;
  return base.replace(/-/g, '+').replace(/_/g, '/');
}

function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice      = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: contentType });
}

function msgBg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}
