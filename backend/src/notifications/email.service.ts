import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   config.get('SMTP_HOST',    'smtp.gmail.com'),
      port:   Number(config.get('SMTP_PORT', '587')),
      secure: config.get('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: config.get('SMTP_USER', ''),
        pass: config.get('SMTP_PASS', ''),
      },
    });
  }

  async enviarConfirmacionDte(params: {
    destinatario: string;
    nombre: string;
    tipoDte: string;
    numeroControl: string;
    codigoGeneracion: string;
    total: number;
    totalLetras?: string;
    selloRecepcion?: string;
    /** Adjuntar el PDF del DTE al correo */
    pdfBuffer?: Buffer;
    /** Adjuntar el JSON del DTE al correo (requerido por normativa MH) */
    jsonBuffer?: Buffer;
    /** Datos del emisor para brandear el correo */
    empresaNombre?: string;
    empresaLogoPath?: string;
  }): Promise<void> {
    const {
      destinatario, nombre, tipoDte, numeroControl, codigoGeneracion,
      total, totalLetras, selloRecepcion, pdfBuffer, jsonBuffer,
      empresaNombre, empresaLogoPath,
    } = params;

    const tipos: Record<string, string> = {
      '01': 'Factura Consumidor Final',
      '03': 'Comprobante de Crédito Fiscal',
      '04': 'Nota de Remisión',
      '05': 'Nota de Crédito',
      '06': 'Nota de Débito',
      '07': 'Comprobante de Retención',
      '11': 'Factura de Exportación',
      '14': 'Factura Sujeto Excluido',
      '15': 'Comprobante de Donación',
    };
    const tipoNombre = tipos[tipoDte] ?? `Tipo ${tipoDte}`;

    // Sello: solo mostrar si es real (no empieza por DEMO-)
    const selloReal =
      selloRecepcion && !selloRecepcion.startsWith('DEMO-') ? selloRecepcion : null;

    const from = this.config.get('SMTP_FROM', this.config.get('SMTP_USER', 'noreply@facturacion.sv'));

    // ── Logo inline (CID) ────────────────────────────────────────────────────
    const attachments: any[] = [];
    let logoHtml = '';

    if (empresaLogoPath) {
      try {
        const logoFull = join(process.cwd(), empresaLogoPath);
        if (existsSync(logoFull)) {
          const logoData = readFileSync(logoFull);
          const ext = empresaLogoPath.split('.').pop()?.toLowerCase() ?? 'png';
          const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
          attachments.push({
            filename: `logo.${ext}`,
            content: logoData,
            contentType: mime,
            cid: 'empresa-logo',
          });
          logoHtml = `<img src="cid:empresa-logo" alt="${empresaNombre ?? ''}" style="max-height: 56px; max-width: 180px; object-fit: contain; display: block;" />`;
        }
      } catch {
        // Logo no crítico; continuar sin él
      }
    }

    if (pdfBuffer) {
      attachments.push({
        filename: `DTE-${numeroControl}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    }

    // JSON del DTE — requerido por normativa MH
    if (jsonBuffer) {
      attachments.push({
        filename: `DTE-${numeroControl}.json`,
        content: jsonBuffer,
        contentType: 'application/json',
      });
    }

    const nombreEmisor = empresaNombre ?? 'Sistema DTE El Salvador';

    try {
      await this.transporter.sendMail({
        from: `"${nombreEmisor}" <${from}>`,
        to: destinatario,
        subject: `DTE Emitido — ${tipoNombre} ${numeroControl}`,
        attachments,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <!-- HEADER -->
            <div style="background: #1a56db; padding: 20px 24px; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 16px;">
              ${logoHtml
                ? `<div style="background: #fff; border-radius: 6px; padding: 6px 10px; display: inline-block;">${logoHtml}</div>`
                : ''}
              <div>
                <div style="color: white; font-size: 18px; font-weight: 700; line-height: 1.2;">
                  ${nombreEmisor}
                </div>
                <div style="color: rgba(255,255,255,0.85); font-size: 13px; margin-top: 2px;">
                  🧾 Documento Tributario Electrónico — ${tipoNombre}
                </div>
              </div>
            </div>
            <!-- BODY -->
            <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
              <p style="margin-top: 0;">Estimado(a) <strong>${nombre}</strong>,</p>
              <p>Se ha emitido el siguiente documento tributario a su nombre:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr style="background: #f9fafb;">
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-weight: 600; width: 40%;">Tipo</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${tipoNombre}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-weight: 600;">N° Control</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-family: monospace;">${numeroControl}</td>
                </tr>
                <tr style="background: #f9fafb;">
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-weight: 600;">Código Generación</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-family: monospace; font-size: 12px;">${codigoGeneracion}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-weight: 600;">Total</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-weight: 700; font-size: 18px;">$${Number(total).toFixed(2)}</td>
                </tr>
                ${totalLetras ? `
                <tr style="background: #f9fafb;">
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-weight: 600;">Monto en letras</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-size: 12px;">${totalLetras}</td>
                </tr>` : ''}
                ${selloReal ? `
                <tr style="background: #f9fafb;">
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-weight: 600;">Sello MH</td>
                  <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-family: monospace; font-size: 11px;">${selloReal}</td>
                </tr>` : ''}
              </table>
              <p style="color: #6b7280; font-size: 13px; margin-bottom: 0;">
                Este es un mensaje automático del sistema de facturación electrónica DTE El Salvador.
                ${pdfBuffer || jsonBuffer
                  ? `Se adjunta${pdfBuffer ? ' el PDF' : ''}${pdfBuffer && jsonBuffer ? ' y' : ''}${jsonBuffer ? ' el archivo JSON' : ''} del documento.`
                  : ''}
              </p>
            </div>
          </div>
        `,
      });
      this.logger.log(`Email enviado a ${destinatario} para DTE ${numeroControl}`);
    } catch (err) {
      this.logger.error(`Error enviando email a ${destinatario}: ${(err as Error).message}`);
    }
  }
}
