import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../notifications/email.service';
import { WhatsappService } from '../../notifications/whatsapp.service';
import { PdfService } from './pdf.service';
import { Dte } from '../entities/dte.entity';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { montoALetras } from '../../utils/numero-letras';

export interface NotificacionParams {
  dte:       Dte;
  correo?:   string | null;
  telefono?: string | null;
  nombre:    string;
  /** Entidad empresa ya cargada (para logo y nombre en el correo) */
  empresa?:  Empresa | null;
}

const TIPOS: Record<string, string> = {
  '01': 'Factura Consumidor Final',
  '03': 'Comprobante de Crédito Fiscal',
  '05': 'Nota de Crédito',
  '06': 'Nota de Débito',
  '07': 'Comprobante de Retención',
  '11': 'Factura de Exportación',
  '14': 'Factura Sujeto Excluido',
  '15': 'Comprobante de Donación',
};

@Injectable()
export class NotificacionDteService {
  private readonly logger = new Logger(NotificacionDteService.name);

  constructor(
    private readonly email:     EmailService,
    private readonly whatsapp:  WhatsappService,
    private readonly pdf:       PdfService,
  ) {}

  /**
   * Programa el envío de notificaciones tras la emisión exitosa de un DTE.
   *
   * - WhatsApp (si hay teléfono): encola inmediatamente; la cola garantiza
   *   15 s entre mensajes para no arriesgar el número.
   * - Email (si hay correo): envía 20 s después con el PDF adjunto.
   *
   * La llamada es no-bloqueante (no await) — no afecta el tiempo de respuesta.
   */
  programar(params: NotificacionParams): void {
    const { dte, correo, telefono, nombre, empresa } = params;

    if (!correo && !telefono) return;

    const tipoNombre = TIPOS[dte.tipoDte] ?? `Tipo ${dte.tipoDte}`;

    // Generamos el PDF una sola vez, de forma diferida
    // El primer envío (WA a los 0 s desde cola, o email a los 20 s) lo genera
    this.ejecutarNotificaciones({ dte, correo, telefono, nombre, tipoNombre, empresa: empresa ?? dte.empresa ?? null });
  }

  private async ejecutarNotificaciones(p: {
    dte:       Dte;
    correo?:   string | null;
    telefono?: string | null;
    nombre:    string;
    tipoNombre: string;
    empresa?:  Empresa | null;
  }) {
    let pdfBuffer: Buffer | null = null;

    // Obtener PDF (un solo intento; si falla se loguea y se continúa)
    try {
      pdfBuffer = await this.pdf.generarPdf(p.dte.id);
    } catch (err: any) {
      this.logger.error(`No se pudo generar PDF para DTE ${p.dte.id}: ${err.message}`);
    }

    const caption = this.buildCaption(p.dte, p.tipoNombre, p.nombre);

    // ── WhatsApp ─────────────────────────────────────────────────────────────
    if (p.telefono && pdfBuffer) {
      try {
        this.whatsapp.encolarMensaje({
          telefono:  p.telefono,
          pdfBuffer,
          caption,
          dteId:     p.dte.id,
        });
      } catch (err: any) {
        this.logger.error(`Error encolando WA para DTE ${p.dte.id}: ${err.message}`);
      }
    }

    // ── Email (20 s después) ─────────────────────────────────────────────────
    if (p.correo) {
      // Serializar el JSON firmado del DTE para adjuntarlo al correo
      let jsonBuffer: Buffer | undefined;
      try {
        const jsonStr = JSON.stringify(p.dte.jsonDte, null, 2);
        jsonBuffer = Buffer.from(jsonStr, 'utf-8');
      } catch {
        this.logger.warn(`No se pudo serializar jsonDte para DTE ${p.dte.id}`);
      }

      setTimeout(async () => {
        try {
          await this.email.enviarConfirmacionDte({
            destinatario:     p.correo!,
            nombre:           p.nombre,
            tipoDte:          p.dte.tipoDte,
            numeroControl:    p.dte.numeroControl,
            codigoGeneracion: p.dte.codigoGeneracion,
            total:            Number(p.dte.totalPagar),
            totalLetras:      montoALetras(Number(p.dte.totalPagar)),
            selloRecepcion:   p.dte.selloRecepcion ?? undefined,
            pdfBuffer:        pdfBuffer ?? undefined,
            jsonBuffer,
            empresaNombre:    p.empresa?.nombreComercial || p.empresa?.nombreLegal,
            empresaLogoPath:  p.empresa?.logoPath ?? undefined,
          });
        } catch (err: any) {
          this.logger.error(`Error enviando email para DTE ${p.dte.id}: ${err.message}`);
        }
      }, 20_000);
    }
  }

  private buildCaption(dte: Dte, tipoNombre: string, nombre: string): string {
    return (
      `🧾 *${tipoNombre}*\n` +
      `👤 ${nombre}\n` +
      `📄 N° Control: \`${dte.numeroControl}\`\n` +
      `💵 Total: *$${Number(dte.totalPagar).toFixed(2)}*\n` +
      `✅ Estado MH: ${dte.estado}\n\n` +
      `_Documento tributario electrónico emitido. Conserve este archivo._`
    );
  }
}
