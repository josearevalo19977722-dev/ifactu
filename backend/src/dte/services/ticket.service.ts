import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Dte } from '../entities/dte.entity';
import { montoALetras } from '../../utils/numero-letras';
import { getAmbiente } from './mh-config.helper';

@Injectable()
export class TicketService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Genera el conjunto de variables necesarias para que un sistema externo (POS)
   * pueda imprimir un ticket legal de DTE.
   */
  getVariablesForTicket(dte: Dte) {
    const json = dte.jsonDte as any;
    // Usa el ambiente de la empresa del DTE; fallback al .env
    const ambiente = getAmbiente(dte.empresa, this.config);
    
    // El QR oficial del MH sigue este patrón:
    // https://pwa.mh.gob.sv/consultadte/query?codGen=...&fecEmi=...&ambiente=...
    const qrUrl = `https://pwa.mh.gob.sv/consultadte/query?codGen=${dte.codigoGeneracion}&fecEmi=${dte.fechaEmision}&ambiente=${ambiente}`;

    return {
      codigoGeneracion: dte.codigoGeneracion,
      numeroControl: dte.numeroControl,
      selloRecepcion: dte.selloRecepcion,
      fechaEmision: dte.fechaEmision,
      horaEmision: json.identificacion?.horEmi || '',
      totalPagar: Number(dte.totalPagar),
      montoLetras: montoALetras(Number(dte.totalPagar)),
      qrUrl,
      estado: dte.estado,
    };
  }
}
