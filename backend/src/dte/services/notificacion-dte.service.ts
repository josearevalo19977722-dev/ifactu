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
   * Solo envía correo electrónico (con PDF y JSON adjuntos).
   * La llamada es no-bloqueante (no await) — no afecta el tiempo de respuesta.
   */
  programar(params: NotificacionParams): void {
    const { dte, correo, nombre, empresa } = params;
    const empresaObj = empresa ?? dte.empresa ?? null;
    const tipoNombre = TIPOS[dte.tipoDte] ?? `Tipo ${dte.tipoDte}`;

    if (correo) {
      this.ejecutarNotificaciones({ dte, correo, nombre, tipoNombre, empresa: empresaObj });
    }

    // Copia a la empresa 15 segundos después
    const correoEmpresa = empresaObj?.correo;
    if (correoEmpresa && correoEmpresa !== correo) {
      setTimeout(() => {
        this.ejecutarNotificaciones({
          dte,
          correo:     correoEmpresa,
          nombre:     empresaObj?.nombreComercial || empresaObj?.nombreLegal || 'Empresa',
          tipoNombre,
          empresa:    empresaObj,
        });
      }, 15_000);
    }
  }

  private async ejecutarNotificaciones(p: {
    dte:        Dte;
    correo:     string;
    nombre:     string;
    tipoNombre: string;
    empresa?:   Empresa | null;
  }) {
    let pdfBuffer: Buffer | null = null;

    try {
      pdfBuffer = await this.pdf.generarPdf(p.dte.id);
    } catch (err: any) {
      this.logger.error(`No se pudo generar PDF para DTE ${p.dte.id}: ${err.message}`);
    }

    // Serializar el JSON firmado del DTE para adjuntarlo al correo
    let jsonBuffer: Buffer | undefined;
    try {
      const jsonStr = JSON.stringify(p.dte.jsonDte, null, 2);
      jsonBuffer = Buffer.from(jsonStr, 'utf-8');
    } catch {
      this.logger.warn(`No se pudo serializar jsonDte para DTE ${p.dte.id}`);
    }

    try {
      await this.email.enviarConfirmacionDte({
        destinatario:     p.correo,
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
  }
}
