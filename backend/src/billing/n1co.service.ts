import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface N1coPlan {
  planId: number;
  name: string;
  description: string;
  billingCycleType: string;
  billingCyclesNumber: number;
  isActive: boolean;
  paymentLink: {
    code: string;
    linkUrl: string;
    amount: number;
  };
}

@Injectable()
export class N1coService {
  private readonly logger = new Logger(N1coService.name);
  private readonly baseUrl: string;
  private readonly locationId: number;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.baseUrl     = config.get<string>('N1CO_API_URL', 'https://api-sandbox.n1co.shop/api/v3');
    this.locationId  = Number(config.get<string>('N1CO_LOCATION_ID', '444'));
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const clientId     = this.config.get<string>('N1CO_CLIENT_ID');
    const clientSecret = this.config.get<string>('N1CO_CLIENT_SECRET');

    const { data } = await firstValueFrom(
      this.http.post(`${this.baseUrl}/Token`, { clientId, clientSecret }),
    );

    this.cachedToken    = data.accessToken as string;
    this.tokenExpiresAt = Date.now() + (data.expiresIn - 60) * 1000; // refrescar 1 min antes

    this.logger.log('Token N1CO obtenido');
    return this.cachedToken!;
  }

  private async headers() {
    return {
      Authorization: `Bearer ${await this.getToken()}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Planes ────────────────────────────────────────────────────────────────

  /** Crea un plan en N1CO y devuelve planId + paymentLink */
  async crearPlan(params: {
    nombre: string;
    descripcion: string;
    monto: number;
    meses?: number;
    billingCyclesNumber?: number;
  }): Promise<N1coPlan> {
    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/Plans`,
        {
          name:                  params.nombre,
          description:           params.descripcion,
          amount:                params.monto,
          billingCyclesNumber:   params.billingCyclesNumber ?? params.meses ?? 1,
          billingCycleType:      'Month',
          locationId:            this.locationId,
        },
        { headers: await this.headers() },
      ),
    );
    return data as N1coPlan;
  }

  /**
   * Crea los dos planes N1CO para un ítem del catálogo de paquetes extra:
   * - una-vez: billingCyclesNumber=1 (pago único)
   * - permanente: billingCyclesNumber=0 (recurrente indefinido)
   */
  async crearPlanesParaExtra(params: {
    cantidad: number;
    precio: number;
    nombre?: string;
  }): Promise<{
    unaVez: { planId: number; paymentLinkUrl: string };
    permanente: { planId: number; paymentLinkUrl: string };
  }> {
    const label = params.nombre ?? `${params.cantidad}`;

    const [planUnaVez, planPermanente] = await Promise.all([
      this.crearPlan({
        nombre:               `${label} DTEs (única vez)`,
        descripcion:          `Paquete de ${params.cantidad} DTEs extra, pago único`,
        monto:                params.precio,
        billingCyclesNumber:  1,
      }),
      this.crearPlan({
        nombre:               `${label} DTEs (mensual)`,
        descripcion:          `Paquete de ${params.cantidad} DTEs extra, recurrente mensual`,
        monto:                params.precio,
        billingCyclesNumber:  120, // 10 años — efectivamente indefinido (N1CO no acepta 0)
      }),
    ]);

    this.logger.log(
      `Planes N1CO creados para extra ${params.cantidad} DTEs — ` +
      `unaVez=${planUnaVez.planId}, permanente=${planPermanente.planId}`,
    );

    return {
      unaVez:     { planId: planUnaVez.planId,     paymentLinkUrl: planUnaVez.paymentLink.linkUrl },
      permanente: { planId: planPermanente.planId, paymentLinkUrl: planPermanente.paymentLink.linkUrl },
    };
  }

  /** Obtiene un plan por ID */
  async obtenerPlan(planId: number): Promise<N1coPlan> {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/Plans/${planId}`, {
        headers: await this.headers(),
      }),
    );
    return data as N1coPlan;
  }

  /** Lista todos los planes de la cuenta */
  async listarPlanes(): Promise<N1coPlan[]> {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/Plans`, {
        headers: await this.headers(),
      }),
    );
    return (data?.plans ?? data ?? []) as N1coPlan[];
  }

  // ── Órdenes ───────────────────────────────────────────────────────────────

  /** Consulta el estado de una orden por su orderCode */
  async consultarOrden(orderCode: string): Promise<any> {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/Orders/${orderCode}`, {
        headers: await this.headers(),
      }),
    );
    return data;
  }

  /** Lista órdenes de la cuenta */
  async listarOrdenes(): Promise<any[]> {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/Orders`, {
        headers: await this.headers(),
      }),
    );
    return data?.orders ?? [];
  }
}
