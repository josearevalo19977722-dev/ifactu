import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ExtensionLicense } from './extension-license.entity';
import { LicenseDevice } from './license-device.entity';
import { ExtensionPlanConfig } from './extension-plan-config.entity';
import { ExtensionPago } from './extension-pago.entity';
import { EmailService } from '../notifications/email.service';

/** Respuesta que consume la extensión en GET /extension/validate */
export interface ValidarResult {
  valid: boolean;
  nombre?: string;
  email?: string;
  plan?: string;
  plan_nombre?: string;
  origen?: string;
  /** null = ilimitado */
  max_dtes_mes?: number | null;
  dtes_usados_mes?: number;
  fecha_fin?: string | null;
  /** Features del plan (la extensión puede usarlas o quedarse con sus defaults) */
  max_cuentas_correo?: number | null;
  f07?: boolean;
  excel?: boolean;
  /** Add-on "Actualizaciones de por vida" activo (comprado o incluido en el plan) */
  updates?: boolean;
  error?: string;
}

const PLAN_NOMBRES: Record<string, string> = {
  basico:     'Básico',
  pro:        'Pro',
  ilimitado:  'Ilimitado',
  ifactu:     'iFactu (incluido)',
  // Legacy — licencias vendidas con el esquema anterior
  free:       'Gratuito',
  monthly:    'Mensual',
  annual:     'Anual',
  lifetime_1: 'Vitalicio (1 equipo)',
  lifetime_2: 'Vitalicio (2 equipos)',
  lifetime_5: 'Vitalicio (5 equipos)',
};

/**
 * Features por plan cuando no hay registro en extension_plan_config
 * (fallback que coincide con lo hardcodeado en la extensión).
 */
const PLAN_FEATURES_DEFAULT: Record<string, { cuentas: number; f07: boolean; excel: boolean }> = {
  basico:    { cuentas: 1, f07: false, excel: false },
  pro:       { cuentas: 3, f07: true,  excel: true },
  ilimitado: { cuentas: 0, f07: true,  excel: true },
  ifactu:    { cuentas: 0, f07: true,  excel: true },
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
    @InjectRepository(ExtensionPago)
    private readonly pagoRepo: Repository<ExtensionPago>,
    private readonly emailService: EmailService,
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

  /**
   * Genera una clave de licencia en formato XXXX-XXXX-XXXX-XXXX
   * (16 chars hex uppercase, almacenados SIN guiones en BD).
   * El usuario la ve con guiones; la extensión los inserta automáticamente.
   */
  private generarApiKey(): string {
    return randomBytes(8).toString('hex').toUpperCase(); // ej: A3F79B2E4C1D8E6A
  }

  /**
   * Normaliza la clave antes de buscarla en BD:
   * quita guiones/espacios y convierte a mayúsculas.
   * Soporta tanto el nuevo formato corto (16 hex) como UUIDs legacy.
   */
  private normalizarClave(raw: string): string {
    return raw.replace(/[-\s]/g, '').toUpperCase();
  }

  /** Busca la licencia normalizando ambos lados: input del usuario y valor en BD.
   *  Soporta tanto el nuevo formato corto (16 hex sin guiones)
   *  como UUIDs legacy (32 hex con guiones en formato 8-4-4-4-12). */
  private async buscarPorClave(rawClave: string): Promise<ExtensionLicense | null> {
    const stripped = rawClave.replace(/[-\s]/g, '').toUpperCase();
    return this.repo
      .createQueryBuilder('l')
      .where("REPLACE(UPPER(l.\"apiKey\"), '-', '') = :key", { key: stripped })
      .andWhere('l.activa = true')
      .getOne();
  }

  async validar(apiKey: string): Promise<ValidarResult> {
    if (!apiKey) return { valid: false, error: 'Clave no proporcionada' };

    const lic = await this.buscarPorClave(apiKey);
    if (!lic) return { valid: false, error: 'Licencia inválida o revocada' };

    if (lic.expiresAt && new Date() > lic.expiresAt) {
      return { valid: false, error: 'Licencia expirada' };
    }

    // Reiniciar contador si es nuevo mes
    const licActualizada = await this.resetearContadorSiNuevoMes(lic);

    // Features del plan: config en BD > fallback hardcodeado > defaults básicos
    const planCfg  = await this.planRepo.findOne({ where: { tipo: licActualizada.plan } }).catch(() => null);
    const fallback = PLAN_FEATURES_DEFAULT[licActualizada.plan];
    const cuentas  = planCfg?.maxCuentasCorreo ?? fallback?.cuentas ?? 1;

    return {
      valid:           true,
      nombre:          licActualizada.nombre   ?? undefined,
      email:           licActualizada.email    ?? undefined,
      plan:            licActualizada.plan,
      plan_nombre:     PLAN_NOMBRES[licActualizada.plan] ?? licActualizada.plan,
      origen:          licActualizada.origen,
      // null = ilimitado (la extensión espera null, no 0)
      max_dtes_mes:    licActualizada.maxDtesMes > 0 ? licActualizada.maxDtesMes : null,
      dtes_usados_mes: licActualizada.dtesUsadosMes,
      fecha_fin:       licActualizada.expiresAt?.toISOString() ?? null,
      max_cuentas_correo: cuentas > 0 ? cuentas : null,
      f07:             planCfg?.incluyeF07   ?? fallback?.f07   ?? false,
      excel:           planCfg?.incluyeExcel ?? fallback?.excel ?? false,
      updates:         this.tieneUpdates(licActualizada),
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
    const lic = await this.buscarPorClave(dto.clave);
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
    const lic = await this.buscarPorClave(dto.clave);
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
      apiKey:      this.generarApiKey(),
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
    // Guard: un where con undefined en TypeORM puede devolver cualquier fila
    if (!usuarioId) return null;
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
    usuarioId?: string;
  }): Promise<ExtensionLicense> {
    const plan       = dto.plan ?? (dto.origen === 'n1co' ? 'basico' : 'ifactu');
    const planCfg    = await this.planRepo.findOne({ where: { tipo: plan } }).catch(() => null);
    const maxDtesMes = dto.maxDtesMes ?? planCfg?.maxDtesMes ?? 150;

    // Si se vincula a un usuario existente, revocar su licencia anterior para evitar duplicados
    if (dto.usuarioId) {
      await this.repo.update({ usuarioId: dto.usuarioId, activa: true }, { activa: false });
    }

    const lic = this.repo.create({
      apiKey:       this.generarApiKey(),
      origen:       dto.origen ?? 'n1co',
      activa:       true,
      plan,
      maxDtesMes,
      expiresAt:    dto.expiresAt ?? null,
      nombre:       dto.nombre,
      email:        dto.email,
      usuarioId:    dto.usuarioId ?? null,
      n1coOrderCode: null,
    });
    return this.repo.save(lic);
  }

  async listar(): Promise<ExtensionLicense[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  /** Genera una nueva API key para la licencia, manteniendo todos los demás datos. */
  async regenerarClave(id: string): Promise<{ apiKey: string }> {
    const lic = await this.repo.findOne({ where: { id } });
    if (!lic) throw new NotFoundException('Licencia no encontrada');
    const nuevaClave = this.generarApiKey();
    await this.repo.update(id, { apiKey: nuevaClave });
    this.logger.log(`Clave regenerada para licencia ${id} (${lic.email})`);
    return { apiKey: nuevaClave };
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

  // ── Consulta pública de cuenta (panel del comprador externo) ──────────────

  /**
   * Devuelve el detalle de la licencia + historial de pagos.
   * Requiere clave Y email coincidente, para que la clave sola
   * (p. ej. compartida en un screenshot) no exponga el historial.
   */
  async consultarCuenta(clave: string, email: string): Promise<{
    ok: boolean;
    error?: string;
    licencia?: any;
    pagos?: { fecha: Date; plan: string | null; monto: number | null; orderCode: string }[];
  }> {
    if (!clave || !email) return { ok: false, error: 'Clave y correo son requeridos' };

    const lic = await this.buscarPorClave(clave);
    if (!lic || (lic.email ?? '').trim().toLowerCase() !== email.trim().toLowerCase()) {
      return { ok: false, error: 'Clave o correo incorrectos' };
    }

    const licActualizada = await this.resetearContadorSiNuevoMes(lic);
    const planCfg = await this.planRepo.findOne({ where: { tipo: licActualizada.plan } }).catch(() => null);
    const pagos = await this.pagoRepo.find({
      where: { licenseId: lic.id },
      order: { createdAt: 'DESC' },
      take: 24,
    });

    return {
      ok: true,
      licencia: {
        plan:          licActualizada.plan,
        planNombre:    PLAN_NOMBRES[licActualizada.plan] ?? licActualizada.plan,
        nombre:        licActualizada.nombre,
        activa:        licActualizada.activa,
        maxDtesMes:    licActualizada.maxDtesMes > 0 ? licActualizada.maxDtesMes : null,
        dtesUsadosMes: licActualizada.dtesUsadosMes,
        expiresAt:     licActualizada.expiresAt,
        maxCuentasCorreo: planCfg ? (planCfg.maxCuentasCorreo > 0 ? planCfg.maxCuentasCorreo : null) : null,
        incluyeF07:    planCfg?.incluyeF07   ?? false,
        incluyeExcel:  planCfg?.incluyeExcel ?? false,
        updates:       this.tieneUpdates(licActualizada),
      },
      pagos: pagos.map(p => ({
        fecha:     p.createdAt,
        plan:      p.planTipo,
        monto:     p.monto != null ? Number(p.monto) : null,
        orderCode: p.orderCode,
      })),
    };
  }

  // ── Webhook N1CO — activar licencia al confirmar pago ─────────────────────

  async procesarPagoN1co(payload: any): Promise<void> {
    const orderCode: string = payload.orderCode ?? payload.code ?? '';
    const status: string    = (payload.status ?? payload.orderStatus ?? '').toLowerCase();
    const email: string     = (payload.customerEmail ?? payload.email ?? payload.buyerEmail ?? '').trim().toLowerCase();
    const nombre: string    = payload.customerName  ?? payload.name  ?? '';
    const monto: number | null = Number(payload.amount ?? payload.total ?? payload.totalAmount) || null;
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

    // Idempotencia: si este orderCode ya fue procesado, no hacer nada
    if (orderCode) {
      const yaExiste = await this.pagoRepo.findOne({ where: { orderCode } });
      if (yaExiste) {
        this.logger.log(`[ExtensionWebhook] orderCode=${orderCode} ya procesado, ignorando reintento`);
        return;
      }
    }

    // Buscar qué plan le corresponde según el planId de N1CO.
    // Cada plan puede tener dos links: el normal y la variante
    // "plan + actualizaciones de por vida" (checkbox en la tienda).
    let conUpdates = false;
    let plan = await this.planRepo.findOne({ where: { n1coPlanId: planN1coId } }).catch(() => null);
    if (!plan && planN1coId != null) {
      plan = await this.planRepo.findOne({ where: { n1coPlanIdConUpdates: planN1coId } }).catch(() => null);
      conUpdates = !!plan;
    }

    // Fallback: N1CO identifica los payment links por slug (pay.n1co.shop/pl/XXXX).
    // Si el payload no trae planId mapeado, buscar el slug de algún link
    // configurado dentro del payload completo.
    if (!plan) {
      const raw = JSON.stringify(payload);
      const slugDe = (url: string | null) => {
        const m = url?.match(/\/pl\/([A-Za-z0-9_-]{6,})/);
        return m?.[1] ?? null;
      };
      const planes = await this.planRepo.find().catch(() => []);
      for (const p of planes) {
        const sNormal = slugDe(p.paymentLinkUrl);
        const sUpd    = slugDe(p.paymentLinkUrlConUpdates);
        if (sNormal && raw.includes(sNormal)) { plan = p; conUpdates = false; break; }
        if (sUpd && raw.includes(sUpd))       { plan = p; conUpdates = true;  break; }
      }
      if (plan) {
        this.logger.log(`[ExtensionWebhook] Plan identificado por slug de payment link: ${plan.tipo}${conUpdates ? ' +updates' : ''}`);
      }
    }

    // ── Add-on "Actualizaciones de por vida" ($5 único, suelto) ──────────────
    if (plan?.tipo === 'updates') {
      await this.procesarCompraAddon({ orderCode, email, nombre, monto, payload });
      return;
    }

    // Si hay licencia previa activa para este email, renovarla/extenderla
    const licExistente = await this.repo.findOne({ where: { email, activa: true, origen: 'n1co' } });

    let lic: ExtensionLicense;
    const esRenovacion = !!licExistente;

    if (licExistente) {
      // Extender o actualizar la licencia existente
      if (plan) {
        licExistente.plan       = plan.tipo;
        licExistente.maxDtesMes = plan.maxDtesMes;
      }
      if (conUpdates) licExistente.updatesLifetime = true;
      licExistente.n1coOrderCode = orderCode;
      licExistente.expiresAt     = this.calcularExpiracion(plan?.tipo ?? licExistente.plan);
      lic = await this.repo.save(licExistente);
      this.logger.log(`[ExtensionWebhook] Licencia renovada para ${email} — plan=${lic.plan}`);
    } else {
      // Si pagó el add-on de updates ANTES de comprar el plan, aplicarlo ahora
      const addonPrevio = await this.pagoRepo.findOne({
        where: { email, planTipo: 'updates' },
      }).catch(() => null);

      // Crear nueva licencia
      lic = await this.repo.save(
        this.repo.create({
          apiKey:          this.generarApiKey(),
          origen:          'n1co',
          activa:          true,
          plan:            plan?.tipo ?? 'basico',
          maxDtesMes:      plan?.maxDtesMes ?? 150,
          updatesLifetime: conUpdates || !!addonPrevio,
          expiresAt:       this.calcularExpiracion(plan?.tipo ?? 'basico'),
          nombre:          nombre || null,
          email,
          usuarioId:       null,
          n1coOrderCode:   orderCode,
        }),
      );
      this.logger.log(`[ExtensionWebhook] Nueva licencia creada para ${email} — plan=${lic.plan}${addonPrevio ? ' +updates' : ''}`);
    }

    // Registrar el pago (historial + marca de idempotencia)
    if (orderCode) {
      await this.pagoRepo.save(
        this.pagoRepo.create({
          licenseId: lic.id,
          orderCode,
          planTipo:  lic.plan,
          monto,
          email,
          nombre:    nombre || null,
          payload,
        }),
      ).catch(err =>
        this.logger.error(`[ExtensionWebhook] No se pudo registrar el pago ${orderCode}: ${err.message}`),
      );
    }

    // Enviar la clave por correo (en renovación sirve de recibo/recordatorio)
    try {
      await this.emailService.enviarClaveLicencia({
        destinatario: email,
        nombre:       nombre || lic.nombre,
        apiKey:       lic.apiKey,
        planNombre:   PLAN_NOMBRES[lic.plan] ?? lic.plan,
        fechaFin:     lic.expiresAt,
        esRenovacion,
      });
    } catch {
      // Ya quedó logueado en EmailService; la licencia existe y el superadmin
      // puede reenviar la clave desde el panel si hiciera falta.
    }
  }

  /**
   * Marca updatesLifetime=true en la licencia del comprador.
   * El flag vive en la licencia (no en el plan): si después sube de
   * Básico a Pro, las actualizaciones se conservan sin volver a cobrar.
   */
  private async procesarCompraAddon(dto: {
    orderCode: string;
    email: string;
    nombre: string;
    monto: number | null;
    payload: any;
  }): Promise<void> {
    const lic = await this.repo.findOne({ where: { email: dto.email, activa: true } });

    // Registrar el pago siempre (idempotencia + que no se pierda el dinero recibido)
    if (dto.orderCode) {
      await this.pagoRepo.save(
        this.pagoRepo.create({
          licenseId: lic?.id ?? null,
          orderCode: dto.orderCode,
          planTipo:  'updates',
          monto:     dto.monto,
          email:     dto.email,
          nombre:    dto.nombre || null,
          payload:   dto.payload,
        }),
      ).catch(err =>
        this.logger.error(`[ExtensionWebhook] No se pudo registrar pago addon ${dto.orderCode}: ${err.message}`),
      );
    }

    if (!lic) {
      // Pagó el add-on sin tener licencia: queda registrado el pago para
      // que el superadmin lo vincule manualmente (o se aplica solo cuando
      // compre un plan con el mismo correo — ver flujo de creación).
      this.logger.warn(`[ExtensionWebhook] Add-on pagado sin licencia previa para ${dto.email} (order=${dto.orderCode})`);
      return;
    }

    if (lic.updatesLifetime) {
      this.logger.log(`[ExtensionWebhook] ${dto.email} ya tenía updates de por vida, pago ${dto.orderCode} registrado`);
      return;
    }

    lic.updatesLifetime = true;
    await this.repo.save(lic);
    this.logger.log(`[ExtensionWebhook] Updates de por vida activadas para ${dto.email}`);

    try {
      await this.emailService.enviarClaveLicencia({
        destinatario: dto.email,
        nombre:       dto.nombre || lic.nombre,
        apiKey:       lic.apiKey,
        planNombre:   PLAN_NOMBRES[lic.plan] ?? lic.plan,
        fechaFin:     lic.expiresAt,
        esAddon:      true,
      });
    } catch {
      // Logueado en EmailService
    }
  }

  private calcularExpiracion(planTipo?: string): Date | null {
    // basico / pro / ilimitado son PAGO ÚNICO: no vencen.
    // El límite mensual de DTEs se reinicia cada mes, pero la licencia es vitalicia.
    if (!planTipo || ['basico', 'pro', 'ilimitado'].includes(planTipo) || planTipo.startsWith('lifetime')) {
      return null;
    }
    // Legacy (esquema anterior por suscripción)
    const now = new Date();
    if (planTipo === 'annual') {
      return new Date(now.setFullYear(now.getFullYear() + 1));
    }
    return new Date(Date.now() + 31 * 24 * 60 * 60 * 1000); // monthly: 31 días
  }

  /** El add-on de actualizaciones está activo si se compró o si el plan lo incluye */
  private tieneUpdates(lic: ExtensionLicense): boolean {
    return lic.updatesLifetime || ['ilimitado', 'ifactu'].includes(lic.plan);
  }
}
