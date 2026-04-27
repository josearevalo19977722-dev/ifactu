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
          logoHtml = `<img src="cid:empresa-logo" alt="${empresaNombre ?? ''}" style="max-height: 80px; max-width: 220px; object-fit: contain; display: block;" />`;
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
        html: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

      <!-- HEADER -->
      <tr>
        <td style="background:#1a56db;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${logoHtml ? `<td width="100" style="padding-right:20px;vertical-align:middle;">
                <div style="background:#fff;border-radius:8px;padding:8px 12px;display:inline-block;">${logoHtml}</div>
              </td>` : ''}
              <td style="vertical-align:middle;">
                <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${nombreEmisor}</div>
                <div style="color:rgba(255,255,255,0.80);font-size:13px;margin-top:4px;">Documento Tributario Electrónico &mdash; ${tipoNombre}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="background:#ffffff;padding:32px;">
          <p style="margin:0 0 8px;font-size:15px;color:#111827;">Estimado(a) <strong>${nombre}</strong>,</p>
          <p style="margin:0 0 24px;font-size:14px;color:#374151;">Se ha emitido el siguiente documento tributario electrónico a su nombre:</p>

          <!-- Tabla de datos -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr style="background:#f0f4ff;">
              <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#374151;width:38%;border-bottom:1px solid #e5e7eb;">Tipo de documento</td>
              <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${tipoNombre}</td>
            </tr>
            <tr style="background:#ffffff;">
              <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">N° Control</td>
              <td style="padding:12px 16px;font-size:12px;font-family:monospace;color:#1e40af;word-break:break-all;border-bottom:1px solid #e5e7eb;">${numeroControl}</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">Código Generación</td>
              <td style="padding:12px 16px;font-size:11px;font-family:monospace;color:#374151;word-break:break-all;border-bottom:1px solid #e5e7eb;">${codigoGeneracion}</td>
            </tr>
            <tr style="background:#ffffff;">
              <td style="padding:14px 16px;font-size:13px;font-weight:700;color:#374151;${totalLetras ? 'border-bottom:1px solid #e5e7eb;' : ''}">Total a pagar</td>
              <td style="padding:14px 16px;font-size:22px;font-weight:800;color:#16a34a;${totalLetras ? 'border-bottom:1px solid #e5e7eb;' : ''}">$${Number(total).toFixed(2)}</td>
            </tr>
            ${totalLetras ? `
            <tr style="background:#f9fafb;">
              <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#374151;${selloReal ? 'border-bottom:1px solid #e5e7eb;' : ''}">Monto en letras</td>
              <td style="padding:12px 16px;font-size:12px;color:#374151;${selloReal ? 'border-bottom:1px solid #e5e7eb;' : ''}">${totalLetras}</td>
            </tr>` : ''}
            ${selloReal ? `
            <tr style="background:#ffffff;">
              <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#374151;">Sello MH</td>
              <td style="padding:12px 16px;font-size:10px;font-family:monospace;color:#374151;word-break:break-all;">${selloReal}</td>
            </tr>` : ''}
          </table>

          ${pdfBuffer || jsonBuffer ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
            <tr>
              <td style="padding:14px 18px;font-size:13px;color:#166534;">
                <strong>Adjuntos:</strong>
                ${pdfBuffer ? ' &#128196; PDF del documento' : ''}
                ${pdfBuffer && jsonBuffer ? ' &middot;' : ''}
                ${jsonBuffer ? ' &#128196; Archivo JSON (requerido por Hacienda)' : ''}
              </td>
            </tr>
          </table>` : ''}
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            Este es un mensaje automático del sistema de facturación electrónica DTE El Salvador.<br>
            Por favor no responda a este correo.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`,
      });
      this.logger.log(`Email enviado a ${destinatario} para DTE ${numeroControl}`);
    } catch (err) {
      this.logger.error(`Error enviando email a ${destinatario}: ${(err as Error).message}`);
    }
  }
}
