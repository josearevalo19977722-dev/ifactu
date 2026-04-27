import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

export type WaEstado = 'DESCONECTADO' | 'CONECTANDO' | 'QR_PENDIENTE' | 'CONECTADO';

interface ColaItem {
  telefono:   string;
  pdfBuffer:  Buffer;
  caption:    string;
  dteId:      string;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);

  private client: any = null;
  private estado: WaEstado = 'DESCONECTADO';
  private qrBase64: string | null = null;

  // Cola de mensajes — se procesa de a uno cada INTERVALO_MS
  private readonly cola: ColaItem[] = [];
  private procesando = false;
  private readonly INTERVALO_MS = 15_000; // 15 s entre mensajes

  constructor(private readonly config: ConfigService) {}

  // ─── Ciclo de vida ───────────────────────────────────────────────────────────

  onModuleInit() {
    this.inicializar();
  }

  onModuleDestroy() {
    this.client?.destroy().catch(() => null);
  }

  // ─── Inicialización ──────────────────────────────────────────────────────────

  private inicializar() {
    this.estado = 'CONECTANDO';
    this.logger.log('Iniciando cliente WhatsApp…');

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
    });

    this.client.on('qr', (qr: string) => {
      this.estado = 'QR_PENDIENTE';
      this.logger.warn('QR WhatsApp generado — escanea desde el panel de administración');
      // Convertir el string QR a imagen base64 con el paquete qrcode
      this.generarQrBase64(qr).then((b64) => {
        this.qrBase64 = b64;
      });
    });

    this.client.on('ready', () => {
      this.estado = 'CONECTADO';
      this.qrBase64 = null;
      const info = this.client.info;
      this.logger.log(`WhatsApp conectado — número: ${info?.wid?.user ?? '?'}`);
    });

    this.client.on('disconnected', (reason: string) => {
      this.estado = 'DESCONECTADO';
      this.logger.warn(`WhatsApp desconectado: ${reason}. Reintentando en 30 s…`);
      setTimeout(() => this.inicializar(), 30_000);
    });

    this.client.on('auth_failure', (msg: string) => {
      this.logger.error(`Error de autenticación WA: ${msg}`);
      this.estado = 'DESCONECTADO';
    });

    this.client.initialize().catch((err: Error) => {
      this.logger.error(`Error al inicializar WA: ${err.message}`);
      this.estado = 'DESCONECTADO';

      // Si el error es "browser already running" limpiar locks y reintentar
      if (err.message?.includes('already running') || err.message?.includes('SingletonLock')) {
        this.logger.warn('Detectado Chrome huérfano — limpiando locks y reintentando en 5 s…');
        this.limpiarChromeLocks();
        setTimeout(() => this.inicializar(), 5_000);
      }
    });
  }

  /** Elimina los lock files de Chrome dentro del directorio de sesión */
  private limpiarChromeLocks() {
    try {
      const sessionDir = join(process.cwd(), '.wwebjs_auth', 'session');
      if (!existsSync(sessionDir)) return;
      // Matar procesos Chrome huérfanos referenciando el directorio de sesión
      try { execSync(`pkill -f "${sessionDir}"`, { stdio: 'ignore' }); } catch { /* no hay proceso */ }
      // Eliminar archivos Singleton* que bloquean el perfil
      const locks = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
      for (const lock of locks) {
        const p = join(sessionDir, lock);
        if (existsSync(p)) { rmSync(p, { force: true }); this.logger.log(`Lock eliminado: ${lock}`); }
      }
    } catch (e: any) {
      this.logger.warn(`No se pudieron limpiar locks: ${e.message}`);
    }
  }

  private async generarQrBase64(qrString: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const QRCode = require('qrcode');
      return await QRCode.toDataURL(qrString, { width: 300, margin: 2 });
    } catch {
      return '';
    }
  }

  // ─── Estado público ──────────────────────────────────────────────────────────

  getEstado(): WaEstado {
    return this.estado;
  }

  getQr(): string | null {
    return this.qrBase64;
  }

  getNumero(): string | null {
    if (this.estado !== 'CONECTADO') return null;
    return this.client?.info?.wid?.user ?? null;
  }

  // ─── Cola de mensajes ────────────────────────────────────────────────────────

  /**
   * Encola un mensaje con PDF. Los mensajes se envían con al menos
   * INTERVALO_MS (15 s) de separación para evitar bloqueos de WA.
   */
  encolarMensaje(params: ColaItem) {
    if (this.estado === 'DESCONECTADO') {
      this.logger.warn(`WA desconectado — mensaje para ${params.telefono} descartado`);
      return;
    }

    // Si está conectando o esperando QR, encolar igualmente: la cola esperará
    this.cola.push(params);
    this.logger.log(`Encolado WA para ${params.telefono} (estado: ${this.estado}, cola: ${this.cola.length})`);

    if (!this.procesando) {
      this.procesarCola();
    }
  }

  private async procesarCola() {
    if (this.procesando || this.cola.length === 0) return;
    this.procesando = true;

    while (this.cola.length > 0) {
      // Esperar hasta que WA esté conectado (max 2 min)
      const listo = await this.esperarConectado(120_000);
      if (!listo) {
        this.logger.warn(`WA no se conectó en 2 min — ${this.cola.length} mensajes descartados`);
        this.cola.length = 0;
        break;
      }

      const item = this.cola.shift()!;
      await this.enviarMensaje(item);

      // Esperar antes del siguiente para no saturar WA
      if (this.cola.length > 0) {
        await new Promise((r) => setTimeout(r, this.INTERVALO_MS));
      }
    }

    this.procesando = false;
  }

  /** Espera hasta que el estado sea CONECTADO o expire el timeout. Resuelve true/false. */
  private esperarConectado(timeoutMs: number): Promise<boolean> {
    if (this.estado === 'CONECTADO') return Promise.resolve(true);
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        if (this.estado === 'CONECTADO') return resolve(true);
        if (this.estado === 'DESCONECTADO') return resolve(false);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(poll, 2_000);
      };
      poll();
    });
  }

  private async enviarMensaje(item: ColaItem, intentos = 0) {
    const MAX_INTENTOS = 4;
    const RETRY_MS    = 8_000; // 8 s entre reintentos

    const numero = this.formatearNumero(item.telefono);
    if (!numero) {
      this.logger.warn(`Número inválido para DTE ${item.dteId}: "${item.telefono}"`);
      return;
    }

    try {
      const media = new MessageMedia(
        'application/pdf',
        item.pdfBuffer.toString('base64'),
        `DTE-${item.dteId.slice(0, 8)}.pdf`,
      );

      await this.client.sendMessage(numero, media, { caption: item.caption });
      this.logger.log(`WhatsApp enviado a ${numero} para DTE ${item.dteId}`);
    } catch (err: any) {
      const esTransitorio =
        err.message?.includes('detached Frame') ||
        err.message?.includes('Execution context') ||
        err.message?.includes('Session closed') ||
        err.message?.includes('Target closed');

      if (esTransitorio && intentos < MAX_INTENTOS) {
        this.logger.warn(
          `WA error transitorio (intento ${intentos + 1}/${MAX_INTENTOS}) para DTE ${item.dteId}: ${err.message} — reintentando en ${RETRY_MS / 1000} s`,
        );
        await new Promise((r) => setTimeout(r, RETRY_MS));
        return this.enviarMensaje(item, intentos + 1);
      }

      this.logger.error(
        `Error definitivo enviando WA a ${item.telefono} (DTE ${item.dteId}): ${err.message}`,
      );
    }
  }

  /**
   * Convierte un número de teléfono al formato WhatsApp:
   *   "71234567"    → "50371234567@c.us"
   *   "+50371234567" → "50371234567@c.us"
   *   "503-7123-4567" → "50371234567@c.us"
   */
  private formatearNumero(raw: string): string | null {
    // Eliminar todo lo que no sea dígito ni "+"
    let limpio = raw.replace(/[^0-9+]/g, '');

    if (limpio.startsWith('+')) limpio = limpio.slice(1);

    // Si ya tiene código de país (503...)
    if (limpio.startsWith('503') && limpio.length === 11) {
      return `${limpio}@c.us`;
    }

    // Número local El Salvador (8 dígitos)
    if (limpio.length === 8) {
      return `503${limpio}@c.us`;
    }

    // Otro formato desconocido
    this.logger.warn(`Formato de número no reconocido: "${raw}" → "${limpio}"`);
    return null;
  }

  // ─── Desconexión manual ──────────────────────────────────────────────────────

  async desconectar() {
    if (this.client) {
      await this.client.logout().catch(() => null);
      await this.client.destroy().catch(() => null);
      this.estado = 'DESCONECTADO';
      this.qrBase64 = null;
    }
  }
}
