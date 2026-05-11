import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { AuthMhService } from '../../auth-mh/auth-mh.service';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { getAmbiente, getMhUrls, isModoDemo, getNitEmisor } from './mh-config.helper';

export interface RespuestaMh {
  estado: 'RECIBIDO' | 'RECHAZADO';
  codigoGeneracion: string;
  selloRecepcion?: string;
  observaciones?: string[];
  descripcionMsg?: string;
  clasificaMsg?: string;
  codigoMsg?: string;
  fhProcesamiento?: string;
}

// Manual MH sección 3.3: timeout 8s, máximo 2 reintentos luego de consultar estado
const RETRY_INTENTOS = 2;
const RETRY_ESPERA_MS = 8000;

// Contador atómico para idEnvio — evita colisiones por timestamp en alta concurrencia
let _idEnvioCounter = 0;
function nextIdEnvio(): string {
  _idEnvioCounter = (_idEnvioCounter + 1) % 1_000_000_000;
  // Combina counter + últimos 3 dígitos de ms para unicidad entre reinicios
  const suffix = (Date.now() % 1000).toString().padStart(3, '0');
  return `${_idEnvioCounter}${suffix}`.slice(-10); // Max 10 dígitos que acepta MH
}

@Injectable()
export class TransmitterService {
  private readonly logger = new Logger(TransmitterService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly authMh: AuthMhService,
  ) {}

  async transmitir(
    tipoDte: string,
    codigoGeneracion: string,
    jsonFirmado: object,
    empresa: Empresa,
  ): Promise<RespuestaMh> {
    // Modo demo: simula respuesta RECIBIDO del MH sin conexión real
    if (isModoDemo(this.config)) {
      this.logger.warn(`[MODO DEMO] DTE ${codigoGeneracion} — simulando respuesta RECIBIDO`);
      return {
        estado: 'RECIBIDO',
        codigoGeneracion,
        selloRecepcion: `DEMO-${Date.now()}`,
        observaciones: ['Modo demo activo — no transmitido al MH real'],
        clasificaMsg: '10',
        codigoMsg: '001',
        descripcionMsg: 'RECIBIDO',
        fhProcesamiento: new Date().toLocaleString('es-ES'),
      };
    }

    const mhUrls   = getMhUrls(empresa, this.config);
    const url      = mhUrls.recepcion;
    const ambiente = getAmbiente(empresa, this.config);
    const nit      = getNitEmisor(empresa);

    // El firmador devuelve un JWT/JWS string. 
    // Hacienda espera el JWS directamente en el campo "documento", NO re-codificado en Base64.
    // El firmador puede devolver un string (JWS) o un objeto con diagnóstico
    let tokenStr = '';
    if (typeof jsonFirmado === 'string') {
      tokenStr = jsonFirmado;
    } else if (jsonFirmado && (jsonFirmado as any).body) {
      tokenStr = (jsonFirmado as any).body;
    } else {
      tokenStr = JSON.stringify(jsonFirmado);
    }
    
    const documento = tokenStr;
    
    const idEnvio = nextIdEnvio();

    const payload = {
      ambiente,
      idEnvio,
      version: this.getVersionPorTipo(tipoDte),
      tipoDte,
      documento,
      nitEmisor: nit, // Campo obligatorio en el cuerpo del JSON
    };

    this.logger.debug(`Payload Diagnóstico - ambiente: ${ambiente}, version: ${payload.version}, tipoDte: ${tipoDte}, idEnvioLen: ${idEnvio.length}, codGenLen: ${codigoGeneracion.length}, docLen: ${documento.length}`);

    let token = await this.authMh.getToken(empresa);

    for (let intento = 1; intento <= RETRY_INTENTOS; intento++) {
      try {
        this.logger.debug(`POST a ${url} - nitEmisor: ${nit}`);
        const { data } = await firstValueFrom(
          this.http.post(url, payload, {
            headers: {
              Authorization: token.trim(), // Limpiar cualquier espacio/newline
              'Content-Type': 'application/json',
              nitEmisor: nit,
              'User-Agent': 'facturacion-dte/1.0',
            },
            timeout: RETRY_ESPERA_MS,
          }),
        );

        this.logger.log(`DTE ${codigoGeneracion} — intento ${intento} — estado: ${data.estado}`);

        return {
          estado: data.estado === 'PROCESADO' || data.estado === 'RECIBIDO'
            ? 'RECIBIDO'
            : 'RECHAZADO',
          codigoGeneracion,
          selloRecepcion: data.selloRecibido,
          observaciones: data.observaciones,
          descripcionMsg: data.descripcionMsg,
          clasificaMsg: data.clasificaMsg,
          codigoMsg: data.codigoMsg,
          fhProcesamiento: data.fhProcesamiento,
        };
      } catch (error) {
        const statusCode: number | undefined = error.response?.status;
        const mhErrorBody = error.response?.data;

        this.logger.error(`Error en transmision: ${statusCode} - ${JSON.stringify(mhErrorBody || error.message)}`);

        // Punto 5 — 401: token expirado o inválido → invalidar caché y reintentar con token fresco
        if (statusCode === 401) {
          this.logger.warn(`DTE ${codigoGeneracion} — 401 recibido, invalidando token y reautenticando`);
          this.authMh.invalidarToken(empresa.id);
          token = await this.authMh.getToken(empresa);
          continue;
        }

        // 400: rechazo definitivo del MH — reportar el detalle de Hacienda
        if (statusCode === 400) {
          // Log forense para auditoría profunda
          try {
            const isObject = typeof jsonFirmado === 'object' && jsonFirmado !== null;
            const diag = isObject ? (jsonFirmado as any).diagnostico || {} : {};
            const forensicLog = `
--- FALLO DTE ${new Date().toISOString()} ---
ID ENVIO: ${idEnvio}
NIT EMISOR: ${nit}
DIAGNOSTICO: CertLen=${diag.certLen || 0}, KeyLen=${diag.keyLen || 0}
PAYLOAD: ${JSON.stringify(payload)}
RESPONSE: ${JSON.stringify(mhErrorBody)}
-------------------------------------------
`;
            fs.appendFileSync(path.join(process.cwd(), 'dte_diagnostic.log'), forensicLog);
          } catch (e) {
            this.logger.error('No se pudo escribir el log forense', e.message);
          }

          return {
            estado: 'RECHAZADO',
            codigoGeneracion,
            observaciones: mhErrorBody?.observaciones || [mhErrorBody?.descripcionMsg || 'Error de esquema/formato (400)'],
            descripcionMsg: mhErrorBody?.descripcionMsg || 'Petición incorrecta o datos malformados',
          };
        }

        const esFalloDeRed =
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNRESET' ||
          (statusCode !== undefined && statusCode >= 500);

        this.logger.warn(`Intento ${intento}/${RETRY_INTENTOS} fallido: ${error.message}`);

        if (intento < RETRY_INTENTOS && esFalloDeRed) {
          await this.esperar(RETRY_ESPERA_MS);

          // Manual MH sección 3.3: antes de reintentar, consultar si el DTE ya fue recibido
          const yaRecibido = await this.consultarEstadoPreReintento(
            codigoGeneracion,
            tipoDte,
            nit,
            token,
            ambiente,
            mhUrls.consulta,
          );
          if (yaRecibido) {
            this.logger.log(
              `DTE ${codigoGeneracion} ya fue recibido por el MH — omitiendo reintento`,
            );
            return yaRecibido;
          }

          continue;
        }

        // Reintentos agotados → contingencia
        throw new Error(`CONTINGENCIA: ${error.message}`);
      }
    }

    throw new Error('CONTINGENCIA: MH no disponible después de los reintentos');
  }

  /**
   * Manual MH sección 3.3: antes de cada reintento consultar si el DTE ya fue recibido.
   * Devuelve RespuestaMh si ya fue recibido, null si no.
   */
  private async consultarEstadoPreReintento(
    codigoGeneracion: string,
    tipoDte: string,
    nit: string,
    token: string,
    ambiente: string,
    consultaUrl: string,
  ): Promise<RespuestaMh | null> {
    if (!consultaUrl) return null;

    try {
      const { data } = await firstValueFrom(
        this.http.get(`${consultaUrl}/${codigoGeneracion}`, {
          params: { ambiente, tipoDte },
          headers: {
            Authorization: token,
            nitEmisor: nit,
            'User-Agent': 'facturacion-dte/1.0',
          },
          timeout: 8000,
        }),
      );

      if (data?.selloRecibido) {
        this.logger.log(`Consulta pre-reintento: DTE ${codigoGeneracion} ya fue recibido por MH`);
        return {
          estado: 'RECIBIDO',
          codigoGeneracion,
          selloRecepcion: data.selloRecibido,
          observaciones: data.observaciones,
          descripcionMsg: data.descripcionMsg,
          clasificaMsg: data.clasificaMsg,
          codigoMsg: data.codigoMsg,
          fhProcesamiento: data.fhProcesamiento,
        };
      }
    } catch (err) {
      // Si la consulta falla, continuamos con el reintento normal
      this.logger.warn(`Consulta pre-reintento fallida para ${codigoGeneracion}: ${err.message}`);
    }

    return null;
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getVersionPorTipo(tipoDte: string): number {
    const versiones: Record<string, number> = {
      '01': 1,
      '03': 3,
      '04': 3,
      '05': 3,
      '06': 3,
      '07': 1,
      '08': 1,
      '09': 1,
      '11': 1,
      '14': 1,
      '15': 1,
    };
    return versiones[tipoDte] ?? 1;
  }
}
