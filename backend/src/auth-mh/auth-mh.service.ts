import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Empresa } from '../empresa/entities/empresa.entity';
import { getMhUrls } from '../dte/services/mh-config.helper';

@Injectable()
export class AuthMhService {
  private readonly logger = new Logger(AuthMhService.name);
  
  // Cache de tokens por empresaId: Map<empresaId, { token: string, expiry: Date }>
  private tokens = new Map<string, { token: string; expiry: Date }>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getToken(empresa: Empresa): Promise<string> {
    const cache = this.tokens.get(empresa.id);
    if (cache && new Date() < cache.expiry) {
      return cache.token;
    }
    return this.authenticate(empresa);
  }

  /**
   * Invalida el token cacheado para una empresa, forzando re-autenticación
   * en el próximo getToken(). Llamar cuando el MH devuelva 401.
   */
  invalidarToken(empresaId: string): void {
    this.tokens.delete(empresaId);
    this.logger.warn(`Token invalidado para empresa ${empresaId} — se re-autenticará en el próximo envío`);
  }

  private async authenticate(empresa: Empresa): Promise<string> {
    const url = getMhUrls(empresa, this.config).auth;
    const nit = empresa.nit.replace(/-/g, '');
    const pwd = empresa.mhApiKey;

    if (!pwd) {
      throw new Error(`Empresa ${empresa.nombreLegal} no tiene configurada la API Key / Contraseña de Hacienda.`);
    }

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          url,
          `user=${encodeURIComponent(nit)}&pwd=${encodeURIComponent(pwd)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'facturacion-dte/1.0',
            },
          },
        ),
      );

      const rawToken  = data.body?.token ?? data.token ?? '';
      if (!rawToken) {
        this.logger.error(`Respuesta MH sin token para ${empresa.nombreLegal}: ${JSON.stringify(data)}`);
        throw new Error('Hacienda no devolvió un token válido');
      }

      // El MH ya devuelve el token con "Bearer " incluido (e.g. "Bearer eyJ...")
      // Si no lo incluye, lo agregamos nosotros para no duplicarlo.
      const tokenType = data.body?.tokenType ?? 'Bearer';
      const token = rawToken.startsWith('Bearer ') ? rawToken : `${tokenType} ${rawToken}`;

      // Manual MH p.14: pruebas ('00') = 48h, producción ('01') = 24h
      // Refrescamos con 1h de margen para evitar expiración mid-request
      const horasValidez = empresa.mhAmbiente === '01' ? 23 : 47;
      const expiry = new Date(Date.now() + horasValidez * 60 * 60 * 1000);

      this.tokens.set(empresa.id, { token, expiry });

      this.logger.log(`Token MH obtenido correctamente para empresa: ${empresa.nombreLegal}`);
      return token;
    } catch (error: any) {
      this.logger.error(`Error autenticando empresa ${empresa.nombreLegal} con MH`, error?.response?.data);
      const base = error?.response?.data?.message ?? error?.message ?? String(error);
      let hint = '';
      const msg = String(base);
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        hint =
          ' No se pudo resolver el nombre del servidor MH (DNS). Comprueba conexión a Internet, VPN, ' +
          'DNS (prueba `dig apitest.dtes.mh.gob.sv` o cambiar a 8.8.8.8) y que MH_AUTH_URL en .env sea correcta.';
      }
      throw new Error(`No se pudo obtener token del MH: ${base}.${hint}`);
    }
  }
}
