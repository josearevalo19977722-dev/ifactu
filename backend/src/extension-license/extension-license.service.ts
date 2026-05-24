import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ExtensionLicense } from './extension-license.entity';
import { LicenseDevice } from './license-device.entity';
import { ExtensionPlanConfig } from './extension-plan-config.entity';

/** Respuesta que consume la extensión en GET /extension/validate */
export interface ValidarResult {
  valid: boolean;
  nombre?: string;
  email?: string;
  plan?: string;
  plan_nombre?: string;
  origen?: string;
  max_dtes_mes?: number;
  dtes_usados_mes?: number;
  fecha_fin?: string | null;
  error?: string;
}

const PLAN_NOMBRES: Record<string, string> = {
  free:       'Gratuito',
  monthly:    'Mensual',
  annual:     'Anual',
  lifetime_1: 'Vitalicio (1 equipo)',
  lifetime_2: 'Vitalicio (2 equipos)',
  lifetime_5: 'Vitalicio (5 equipos)',
  ifactu:     'iFactu (incluido)',
};

@Injectable()
export class ExtensionLicenseService {
  private readonly logger = new Logger(ExtensionLicenseService.name);

  constructor(
    @InjectRepository(ExtensionLicense)
    private readonly repo: Repository<ExtensionLicense>,
    @InjectRepository(LicenseDevice)
    private readonly deviceRepo: Repository<LicenseDevice>,
    @InjectRepository(ExtensionPlanConfig)
    private readonly planRepo: Repository<ExtensionPlanConfig>,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Devuelve true si la licencia está dentro del mismo mes calendario del último reset */
  private mismoMes(fecha: Date | null): boolean {
    if (!fecha) return false;
    const now = new Date();
    return (
      fecha.getUTCFullYear() === now.getUTCFullYear() &&
      fecha.getUTCMonth()    === now.getUTCMonth()
    );
  }

  /** Reinicia el contador mensual si es un mes nuevo */
  private async resetearContadorSiNuevoMes(lic: ExtensionLicense): Promise<ExtensionLicense> {
    if (!this.mismoMes(lic.dtesResetAt)) {
      lic.dtesUsadosMes = 0;
      lic.dtesResetAt   = new Date();
      await this.repo.save(lic);
    }
    return lic;
  }

  // ── Validar (llamado por la extensión) ─────────────────────────────────────

  async validar(apiKey: string): Promise<ValidarResult> {
    if (!apiKey) return { valid: false, error: 'Clave no proporcionada' };

    const lic = await this.repo.findOne({ where: { apiKey, activa: true } });
    if (!lic) return { valid: false, error: 'Licencia inválida o revocada' };

    if (lic.expiresAt && new Date() > lic.expiresAt) {
      return { valid: false, error: 'Licencia expirada' };
    }

    // Reiniciar contador si es nuevo mes
    const licActualizada = await this.resetearContadorSiNuevoMes(lic);

    return {
      valid:           true,
      nombre:          licActualizada.nombre   ?? undefined,
      email:           licActualizada.email    ?? undefined,
      plan:            licActualizada.plan,
      plan_nombre:     PLAN_NOMBRES[licActualizada.plan] ?? licActualizada.plan,
      origen:          licActualizada.origen,
      max_dtes_mes:    licActualizada.maxDtesMes,
      dtes_usados_mes: licActualizada.dtesUsadosMes,
      fecha_fin:       licActualizada.expiresAt?.toISOString() ?? null,
    };
  }

  // ── Activar dispositivo ────────────────────────────────────────────────────

  /**
   * POST /api/licencias/activar
   * Registra o actualiza el fingerprint de un dispositivo para la licencia dada.
   * No es crítico — si falla, la extensión lo ignora.
   */
  async activarDispositivo(dto: {
    clave: string;
    fingerprint: string;
    nombre_dispositivo?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const lic = await this.repo.findOne({ where: { apiKey: dto.clave, activa: true } });
    if (!lic) return { success: false, error: 'Licencia no encontrada' };
    if (lic.expiresAt && new Date() > lic.expiresAt) {
      return { success: false, error: 'Licencia expirada' };
    }

    // Verificar límite de dispositivos según plan
    const planCfg = await this.planRepo.findOne({ where: { tipo: lic.plan } }).catch(() => null);
    const maxDisp  = planCfg?.maxDispositivos ?? 1;

    // Buscar si ya existe este fingerprint para esta licencia
    const existente = await this.deviceRepo.findOne({
      where: { licenseId: lic.id, fingerprint: dto.fingerprint },
    });

    if (existente) {
      // Solo actualizar lastSeen
      existente.nombreDispositivo = dto.nombre_dispositivo ?? existente.nombreDispositivo;
      await this.deviceRepo.save(existente);
      return { success: true };
    }

    // Nuevo dispositivo — verificar límite
    const totalActivos = await this.deviceRepo.count({ where: { licenseId: lic.id } });
    if (maxDisp > 0 && totalActivos >= maxDisp) {
      return {
        success: false,
        error:   `Tu plan permite máximo ${maxDisp} dispositivo(s). Revoca uno antes de activar otro.`,
      };
    }

    await this.deviceRepo.save(
      this.deviceRepo.create({
        licenseId:         lic.id,
        fingerprint:       dto.fingerprint,
        nombreDispositivo: dto.nombre_dispositivo ?? null,
      }),
    );

    this.logger.log(`Dispositivo activado para licencia ${lic.id} — ${dto.nombre_dispositivo}`);
    return { success: true };
  }

  // ── Registrar uso ──────────────────────────────────────────────────────────

  /**
   * POST /api/licencias/registrar-uso
   * Incrementa el contador de DTEs del mes actual.
   * Devuelve los totales actualizados para que la extensión actualice su cache.
   */
  async registrarUso(dto: {
    clave: string;
    fingerprint?: string;
    cantidad: number;
  }): Promise<{ ok: boolean; dtes_usados_mes?: number; max_dtes_mes?: number; error?: string }> {
    const lic = await this.repo.findOne({ where: { apiKey: dto.clave, activa: true } });
    if (!lic) return { ok: false, error: 'Licencia no encontrada' };

    const licActualizada = await this.resetearContadorSiNuevoMes(lic);
    const cantidad = Math.max(1, Math.floor(dto.cantidad ?? 1));

    // Verificar límite (0 = ilimitado)
    if (
      licActualizada.maxDtesMes > 0 &&
      licActualizada.dtesUsadosMes + cantidad > licActualizada.maxDtesMes
    ) {
      return {
        ok:              false,
        error:           'Límite mensual de DTEs alcanzado',
        dtes_usados_mes: licActualizada.dtesUsadosMes,
        max_dtes_mes:    licActualizada.maxDtesMes,
      };
    }

    licActualizada.dtesUsadosMes += cantidad;
    await this.repo.save(licActualizada);

    return {
      ok:              true,
      dtes_usados_mes: licActualizada.dtesUsadosMes,
      max_dtes_mes:    licActualizada.maxDtesMes,
    };
  }

  // ── Generar para Contador iFactu ───────────────────────────────────────────

  async generarParaContador(usuarioId: string, nombre: string, email: string): Promise<ExtensionLicense> {
    const existente = await this.repo.findOne({ where: { usuarioId, activa: true } });
    if (existente) return existente;

    const lic = this.repo.create({
      apiKey:      randomUUID(),
      origen:      'ifactu',
      activa:      true,
      plan:        'ifactu',
      maxDtesMes:  0,          // ilimitado para usuarios iFactu
      expiresAt:   null,
      nombre,
      email,
      usuarioId,
      n1coOrderCode: null,
    });
    return this.repo.save(lic);
  }

  async obtenerDeUsuario(usuarioId: string): Promise<ExtensionLicense | null> {
    return this.repo.findOne({ where: { usuarioId, activa: true } });
  }

  // ── CRUD superadmin ────────────────────────────────────────────────────────

  async crear(dto: {
    nombre: string;
    email: string;
    origen?: 'ifactu' | 'n1co';
    plan?: string;
    maxDtesMes?: number;
    expiresAt?: Date;
  }): Promise<ExtensionLicense> {
    const plan       = dto.plan ?? (dto.origen === 'n1co' ? 'monthly' : 'ifactu');
    const planCfg    = await this.planRepo.findOne({ where: { tipo: plan } }).catch(() => null);
    const maxDtesMes = dto.maxDtesMes ?? planCfg?.maxDtesMes ?? 200;

    const lic = this.repo.create({
      apiKey:       randomUUID(),
      origen:       dto.origen ?? 'n1co',
      activa:       true,
      plan,
      maxDtesMes,
      expiresAt:    dto.expiresAt ?? null,
      nombre:       dto.nombre,
      email:        dto.email,
      usuarioId:    null,
      n1coOrderCode: null,
    });
    return this.repo.save(lic);
  }

  async listar(): Promise<ExtensionLicense[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async revocar(id: string): Promise<void> {
    const lic = await this.repo.findOne({ where: { id } });
    if (!lic) throw new NotFoundException('Licencia no encontrada');
    await this.repo.update(id, { activa: false });
  }

  async reactivar(id: string): Promise<void> {
    const lic = await this.repo.findOne({ where: { id } });
    if (!lic) throw new NotFoundException('Licencia no encontrada');
    await this.repo.update(id, { activa: true });
  }

  async actualizar(id: string, dto: Partial<Pick<ExtensionLicense, 'plan' | 'maxDtesMes' | 'expiresAt' | 'nombre' | 'email'>>): Promise<ExtensionLicense> {
    await this.repo.update(id, dto);
    return this.repo.findOneOrFail({ where: { id } });
  }

  // ── Dispositivos de una licencia ───────────────────────────────────────────

  async listarDispositivos(licenseId: string): Promise<LicenseDevice[]> {
    return this.deviceRepo.find({ where: { licenseId }, order: { lastSeen: 'DESC' } });
  }

  async revocarDispositivo(deviceId: string): Promise<void> {
    const dev = await this.deviceRepo.findOne({ where: { id: deviceId } });
    if (!dev) throw new NotFoundException('Dispositivo no encontrado');
    await this.deviceRepo.delete(deviceId);
  }

  // ── Planes de la extensión ─────────────────────────────────────────────────

  async listarPlanes(): Promise<ExtensionPlanConfig[]> {
    return this.planRepo.find({ where: { activo: true }, order: { precio: 'ASC' } });
  }

  async listarPlanesAdmin(): Promise<ExtensionPlanConfig[]> {
    return this.planRepo.find({ order: { precio: 'ASC' } });
  }

  async upsertPlan(dto: Partial<ExtensionPlanConfig> & { tipo: string }): Promise<ExtensionPlanConfig> {
    const existente = await this.planRepo.findOne({ where: { tipo: dto.tipo } });
    if (existente) {
      await this.planRepo.update(dto.tipo, dto);
      return this.planRepo.findOneOrFail({ where: { tipo: dto.tipo } });
    }
    return this.planRepo.save(this.planRepo.create(dto));
  }

  async eliminarPlan(tipo: string): Promise<void> {
    await this.planRepo.delete(tipo);
  }

  /**
   * Devuelve el payment link N1CO de un plan para redirigir al usuario.
   * El email se puede pasar como query param a algunos links de N1CO.
   */
  async obtenerLinkPago(tipo: string, email?: string): Promise<{ url: string; plan: ExtensionPlanConfig }> {
    const plan = await this.planRepo.findOne({ where: { tipo, activo: true } });
    if (!plan) throw new NotFoundException(`Plan "${tipo}" no encontrado`);
    if (!plan.paymentLinkUrl) {
      throw new BadRequestException(`El plan "${tipo}" no tiene un link de pago configurado. Contacta al soporte.`);
    }

    let url = plan.paymentLinkUrl;
    if (email) {
      // N1CO acepta email como param (si el link lo soporta)
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}email=${encodeURIComponent(email)}`;
    }

    return { url, plan };
  }

  // ── Webhook N1CO — activar licencia al confirmar pago ─────────────────────

  async procesarPagoN1co(payload: any): Promise<void> {
    const orderCode: string = payload.orderCode ?? payload.code ?? '';
    const status: string    = (payload.status ?? payload.orderStatus ?? '').toLowerCase();
    const email: string     = payload.customerEmail ?? payload.email ?? payload.buyerEmail ?? '';
    const nombre: string    = payload.customerName  ?? payload.name  ?? '';
    const planN1coId: number | undefined = payload.planId ?? payload.plan?.id;

    this.logger.log(`[ExtensionWebhook] orderCode=${orderCode} status=${status} email=${email}`);

    if (!['paid', 'completed', 'active', 'success'].includes(status)) {
      this.logger.log(`[ExtensionWebhook] Ignorando estado: ${status}`);
      return;
    }

    if (!email) {
      this.logger.warn(`[ExtensionWebhook] Pago confirmado pero sin email. payload=${JSON.stringify(payload)}`);
      return;
    }

    // Buscar qué plan le corresponde según el planId de N1CO
    let plan = await this.planRepo.findOne({ where: { n1coPlanId: planN1coId } }).catch(() => null);

    // Si hay licencia previa activa para este email, renovarla/extenderla
    const licExistente = await this.repo.findOne({ where: { email, activa: true, origen: 'n1co' } });

    if (licExistente) {
      // Extender o actualizar la licencia existente
      if (plan) {
        licExistente.plan      = plan.tipo;
        licExistente.maxDtesMes = plan.maxDtesMes;
      }
      licExistente.n1coOrderCode = orderCode;
      licExistente.expiresAt     = this.calcularExpiracion(plan?.tipo);
      await this.repo.save(licExistente);
      this.logger.log(`[ExtensionWebhook] Licencia renovada para ${email} — plan=${plan?.tipo}`);
    } else {
      // Crear nueva licencia
      const nuevaLic = this.repo.create({
        apiKey:       randomUUID(),
        origen:       'n1co',
        activa:       true,
        plan:         plan?.tipo ?? 'monthly',
        maxDtesMes:   plan?.maxDtesMes ?? 200,
        expiresAt:    this.calcularExpiracion(plan?.tipo),
        nombre:       nombre || null,
        email,
        usuarioId:    null,
        n1coOrderCode: orderCode,
      });
      await this.repo.save(nuevaLic);
      this.logger.log(`[ExtensionWebhook] Nueva licencia creada para ${email} — plan=${plan?.tipo} apiKey=${nuevaLic.apiKey}`);
    }
  }

  private calcularExpiracion(planTipo?: string): Date | null {
    if (!planTipo || planTipo.startsWith('lifetime')) return null; // sin vencimiento
    const now = new Date();
    if (planTipo === 'annual') {
      return new Date(now.setFullYear(now.getFullYear() + 1));
    }
    // monthly por defecto: 31 días
    return new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  }
}
