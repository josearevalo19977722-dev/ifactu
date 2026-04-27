import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PagoN1co, EstadoPago } from './entities/pago-n1co.entity';
import { PlanConfig } from './entities/plan-config.entity';
import { PaqueteCatalogo } from './entities/paquete-catalogo.entity';
import { PaqueteExtraDte } from './entities/paquete-extra-dte.entity';
import { N1coService } from './n1co.service';
import { PaquetesExtrasService } from './paquetes-extras.service';
import { SuscripcionesService } from '../empresa/services/suscripciones.service';
import { Empresa } from '../empresa/entities/empresa.entity';
import { TipoSuscripcion, EstadoSuscripcion } from '../empresa/entities/suscripcion.entity';

/**
 * Valores por defecto — solo se usan si la tabla plan_config está vacía (primer arranque).
 * Los IDs y URLs de N1CO se configuran después desde el panel de superadmin
 * usando el botón "Crear en N1CO", que guarda los valores directamente en la BD.
 */
const PLANES_DEFAULT = {
  [TipoSuscripcion.BASICA]: {
    nombre:              'Plan Básico',
    descripcion:         '100 DTEs/mes · 3 usuarios · 1 sucursal',
    precioMensual:       29.99,
    limiteDtesMensuales: 100,
    limiteUsuarios:      3,
    n1coPlanId:          null,
    paymentLinkUrl:      null,
  },
  [TipoSuscripcion.PROFESIONAL]: {
    nombre:              'Plan Profesional',
    descripcion:         '500 DTEs/mes · 10 usuarios · 3 sucursales · Exportación',
    precioMensual:       79.99,
    limiteDtesMensuales: 500,
    limiteUsuarios:      10,
    n1coPlanId:          null,
    paymentLinkUrl:      null,
  },
  [TipoSuscripcion.EMPRESA]: {
    nombre:              'Plan Empresa',
    descripcion:         '2000 DTEs/mes · 50 usuarios · 10 sucursales · Multi-moneda',
    precioMensual:       199.99,
    limiteDtesMensuales: 2000,
    limiteUsuarios:      50,
    n1coPlanId:          null,
    paymentLinkUrl:      null,
  },
};

// Mantener export para compatibilidad
export const PLANES = PLANES_DEFAULT;

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(PagoN1co)
    private readonly pagoRepo: Repository<PagoN1co>,
    @InjectRepository(PlanConfig)
    private readonly planConfigRepo: Repository<PlanConfig>,
    @InjectRepository(PaqueteCatalogo)
    private readonly catalogoRepo: Repository<PaqueteCatalogo>,
    @InjectRepository(PaqueteExtraDte)
    private readonly paqueteExtraDteRepo: Repository<PaqueteExtraDte>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    private readonly n1co: N1coService,
    private readonly suscripciones: SuscripcionesService,
    private readonly paquetesExtras: PaquetesExtrasService,
    private readonly config: ConfigService,
  ) {}

  /** Al iniciar, siembra los 3 planes estándar si no existen */
  async onModuleInit() {
    const tiposConConfig = [TipoSuscripcion.BASICA, TipoSuscripcion.PROFESIONAL, TipoSuscripcion.EMPRESA];
    for (const tipo of tiposConConfig) {
      const existe = await this.planConfigRepo.findOne({ where: { tipo } });
      if (!existe) {
        const defaults = PLANES_DEFAULT[tipo];
        await this.planConfigRepo.save(
          this.planConfigRepo.create({ tipo, ...defaults, activo: true, esPlanInicial: false }),
        );
        this.logger.log(`Plan ${tipo} sembrado en BD`);
      }
    }

    // Sembrar plan CUSTOM (Ilimitado / Cortesía) si no existe
    const existeCustom = await this.planConfigRepo.findOne({ where: { tipo: TipoSuscripcion.CUSTOM } });
    if (!existeCustom) {
      await this.planConfigRepo.save(
        this.planConfigRepo.create({
          tipo: TipoSuscripcion.CUSTOM,
          nombre: 'Ilimitado / Cortesía',
          descripcion: 'Sin límites · Sin vencimiento · Acceso completo',
          precioMensual: 0,
          limiteDtesMensuales: 999999,
          limiteUsuarios: 999999,
          activo: true,
          esPlanInicial: false,
        }),
      );
      this.logger.log('Plan CUSTOM (Ilimitado / Cortesía) sembrado en BD');
    }

    // Si ningún plan tiene esPlanInicial=true, marcar BASICA como inicial
    const hayInicial = await this.planConfigRepo.findOne({ where: { esPlanInicial: true } });
    if (!hayInicial) {
      await this.planConfigRepo.update({ tipo: TipoSuscripcion.BASICA }, { esPlanInicial: true });
      this.logger.log('Plan BASICA marcado como plan inicial por defecto');
    }
  }

  // ── CRUD de Planes ────────────────────────────────────────────────────────

  /** Obtiene la config de un plan desde BD */
  async getPlanConfig(tipo: string): Promise<PlanConfig> {
    const config = await this.planConfigRepo.findOne({ where: { tipo } });
    if (!config) throw new NotFoundException(`Configuración del plan ${tipo} no encontrada`);
    return config;
  }

  /** Lista todos los planes configurados */
  async listarPlanesConfig(): Promise<PlanConfig[]> {
    return this.planConfigRepo.find({ order: { precioMensual: 'ASC' } });
  }

  /** Superadmin: crea un nuevo plan personalizado */
  async crearPlan(data: {
    tipo?: string;
    nombre: string;
    descripcion: string;
    precioMensual: number;
    limiteDtesMensuales: number;
    limiteUsuarios: number;
    n1coPlanId?: number | null;
    paymentLinkUrl?: string | null;
    activo?: boolean;
    esPlanInicial?: boolean;
  }): Promise<PlanConfig> {
    // Generar slug si no se especificó
    const tipo = data.tipo?.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '') ||
      `PLAN_${Date.now()}`;

    const existe = await this.planConfigRepo.findOne({ where: { tipo } });
    if (existe) throw new BadRequestException(`Ya existe un plan con clave "${tipo}"`);

    // Si se marca como inicial, quitar del resto
    if (data.esPlanInicial) {
      await this.planConfigRepo.query(`UPDATE plan_config SET "esPlanInicial" = false`);
    }

    const plan = this.planConfigRepo.create({
      tipo,
      nombre:              data.nombre,
      descripcion:         data.descripcion,
      precioMensual:       data.precioMensual,
      limiteDtesMensuales: data.limiteDtesMensuales,
      limiteUsuarios:      data.limiteUsuarios,
      n1coPlanId:          data.n1coPlanId ?? null,
      paymentLinkUrl:      data.paymentLinkUrl ?? null,
      activo:              data.activo ?? true,
      esPlanInicial:       data.esPlanInicial ?? false,
    });

    const saved = await this.planConfigRepo.save(plan);
    this.logger.log(`Plan personalizado creado: ${tipo}`);
    return saved;
  }

  /** Superadmin: actualiza la configuración de un plan */
  async actualizarPlanConfig(
    tipo: string,
    data: Partial<Pick<PlanConfig,
      'nombre' | 'descripcion' | 'precioMensual' | 'limiteDtesMensuales' |
      'limiteUsuarios' | 'n1coPlanId' | 'paymentLinkUrl' | 'activo' | 'esPlanInicial'
    >>,
  ): Promise<PlanConfig> {
    const plan = await this.planConfigRepo.findOne({ where: { tipo } });
    if (!plan) throw new NotFoundException(`Plan ${tipo} no encontrado`);

    // Si se está marcando como inicial, quitar el flag de todos los demás
    if (data.esPlanInicial === true) {
      await this.planConfigRepo.query(
        `UPDATE plan_config SET "esPlanInicial" = false WHERE tipo != $1`, [tipo],
      );
    }

    Object.assign(plan, data);
    const saved = await this.planConfigRepo.save(plan);
    this.logger.log(`Plan ${tipo} actualizado`);
    return saved;
  }

  /** Superadmin: marca un plan como el inicial (desmarc los demás) */
  async marcarPlanInicial(tipo: string): Promise<PlanConfig> {
    const plan = await this.planConfigRepo.findOne({ where: { tipo } });
    if (!plan) throw new NotFoundException(`Plan ${tipo} no encontrado`);

    // Quitar flag de todos los demás
    await this.planConfigRepo.query(
      `UPDATE plan_config SET "esPlanInicial" = false WHERE tipo != $1`, [tipo],
    );
    // Poner en el seleccionado
    plan.esPlanInicial = true;
    const saved = await this.planConfigRepo.save(plan);
    this.logger.log(`Plan inicial establecido: ${tipo}`);
    return saved;
  }

  /**
   * Superadmin: crea el plan en N1CO (suscripción mensual recurrente) a partir
   * de la config en BD y guarda el planId + paymentLinkUrl resultantes.
   */
  async crearPlanN1co(tipo: string): Promise<PlanConfig> {
    const plan = await this.planConfigRepo.findOne({ where: { tipo } });
    if (!plan) throw new NotFoundException(`Plan ${tipo} no encontrado`);

    const n1coPlan = await this.n1co.crearPlan({
      nombre:              plan.nombre,
      descripcion:         plan.descripcion,
      monto:               Number(plan.precioMensual),
      billingCyclesNumber: 120, // mensual recurrente — N1CO no acepta 0
    });

    plan.n1coPlanId     = n1coPlan.planId;
    plan.paymentLinkUrl = n1coPlan.paymentLink.linkUrl;
    const saved = await this.planConfigRepo.save(plan);

    this.logger.log(
      `Plan N1CO creado para ${tipo}: planId=${n1coPlan.planId}, link=${n1coPlan.paymentLink.linkUrl}`,
    );
    return saved;
  }

  /** Superadmin: elimina un plan personalizado (no puede eliminar los 3 estándar) */
  async eliminarPlan(tipo: string): Promise<{ mensaje: string }> {
    const TIPOS_ESTANDAR = ['BASICA', 'PROFESIONAL', 'EMPRESA'];
    if (TIPOS_ESTANDAR.includes(tipo)) {
      throw new BadRequestException('No se pueden eliminar los planes estándar (BASICA, PROFESIONAL, EMPRESA)');
    }

    const plan = await this.planConfigRepo.findOne({ where: { tipo } });
    if (!plan) throw new NotFoundException(`Plan ${tipo} no encontrado`);

    await this.planConfigRepo.remove(plan);
    this.logger.log(`Plan ${tipo} eliminado`);
    return { mensaje: `Plan "${tipo}" eliminado correctamente` };
  }

  /** Obtiene el plan marcado como inicial (para nuevas empresas) */
  async getPlanInicial(): Promise<PlanConfig | null> {
    return this.planConfigRepo.findOne({ where: { esPlanInicial: true, activo: true } });
  }

  // ── Flujo de Pago ─────────────────────────────────────────────────────────

  /**
   * Inicia el proceso de pago para un plan.
   * Usa el link de pago fijo del plan en N1CO.
   */
  async iniciarPago(empresaId: string, planTipo: string): Promise<{
    pagoId: string;
    paymentLinkUrl: string;
    monto: number;
    plan: string;
  }> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const planDef = await this.getPlanConfig(planTipo);

    if (!planDef.paymentLinkUrl) {
      throw new BadRequestException(`El plan ${planTipo} no tiene link de pago configurado. Contacta al administrador.`);
    }

    // Extraer el código del link (ej: "xmMNfard" de ".../pl/xmMNfard")
    const linkCode = planDef.paymentLinkUrl?.split('/').pop() ?? null;

    const pago = this.pagoRepo.create({
      empresa,
      planTipo,
      n1coPlanId:     planDef.n1coPlanId ?? null,
      orderCode:      linkCode,
      paymentLinkUrl: planDef.paymentLinkUrl,
      monto:          Number(planDef.precioMensual),
      estado:         EstadoPago.PENDIENTE,
      meses:          1,
    });

    await this.pagoRepo.save(pago);
    this.logger.log(`Pago iniciado: empresa=${empresaId} plan=${planTipo} link=${planDef.paymentLinkUrl}`);

    return {
      pagoId:         pago.id,
      paymentLinkUrl: planDef.paymentLinkUrl,
      monto:          Number(planDef.precioMensual),
      plan:           planDef.nombre,
    };
  }

  /**
   * Verifica el estado de un pago consultando N1CO.
   * Si está pagado → activa la suscripción.
   */
  async verificarPago(pagoId: string): Promise<PagoN1co> {
    const pago = await this.pagoRepo.findOne({
      where: { id: pagoId },
      relations: ['empresa'],
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    if (pago.estado === EstadoPago.PAGADO) return pago;
    if (!pago.orderCode) return pago;

    try {
      const orden = await this.n1co.consultarOrden(pago.orderCode);
      if (orden?.status === 'PAID' || orden?.status === 'FINALIZED') {
        if (pago.tipo === 'EXTRA') {
          await this.confirmarPagoExtra(pago, orden);
        } else {
          await this.confirmarPago(pago, orden);
        }
      } else if (orden?.status === 'CANCELLED') {
        pago.estado = EstadoPago.CANCELADO;
        await this.pagoRepo.save(pago);
      }
    } catch (err: any) {
      this.logger.warn(`Error verificando orden ${pago.orderCode}: ${err.message}`);
    }

    return pago;
  }

  /**
   * Inicia el proceso de pago para un paquete extra de DTEs.
   * Usa el link de pago fijo del catálogo (una-vez o permanente).
   */
  async iniciarPagoExtra(
    empresaId: string,
    dto: { catalogoId: string; esPermanente: boolean },
  ): Promise<{ pagoId: string; paymentLinkUrl: string; monto: number; cantidad: number }> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const catalogo = await this.catalogoRepo.findOne({ where: { id: dto.catalogoId } });
    if (!catalogo) throw new NotFoundException('Opción de catálogo no encontrada');

    const paymentLinkUrl = dto.esPermanente
      ? catalogo.paymentLinkPermanente
      : catalogo.paymentLinkUnaVez;

    if (!paymentLinkUrl) {
      throw new BadRequestException('Esta opción no tiene link de pago configurado');
    }

    // Extraer orderCode del link (último segmento de la URL)
    const orderCode = paymentLinkUrl.split('/').pop() ?? null;

    // Crear PaqueteExtraDte en estado PENDIENTE
    const paquete = this.paqueteExtraDteRepo.create({
      empresaId,
      cantidad:     catalogo.cantidad,
      precio:       Number(catalogo.precio),
      esPermanente: dto.esPermanente,
      estado:       'PENDIENTE',
      activo:       false,
    });
    await this.paqueteExtraDteRepo.save(paquete);

    // Crear PagoN1co asociado
    const pago = this.pagoRepo.create({
      empresa,
      planTipo:       'EXTRA',
      tipo:           'EXTRA',
      n1coPlanId:     dto.esPermanente ? catalogo.n1coPlanIdPermanente : catalogo.n1coPlanIdUnaVez,
      orderCode,
      paymentLinkUrl,
      monto:          Number(catalogo.precio),
      estado:         EstadoPago.PENDIENTE,
      meses:          1,
      paqueteExtraId: paquete.id,
      esPermanente:   dto.esPermanente,
    });
    await this.pagoRepo.save(pago);

    this.logger.log(
      `Pago extra iniciado: empresa=${empresaId} catalogo=${dto.catalogoId} ` +
      `esPermanente=${dto.esPermanente} link=${paymentLinkUrl}`,
    );

    return {
      pagoId:         pago.id,
      paymentLinkUrl,
      monto:          Number(catalogo.precio),
      cantidad:       catalogo.cantidad,
    };
  }

  /**
   * Webhook de N1CO — activa la suscripción automáticamente.
   */
  async procesarWebhook(payload: any): Promise<void> {
    this.logger.log(`Webhook N1CO recibido: ${JSON.stringify(payload).slice(0, 200)}`);

    const orderCode = payload?.orderCode ?? payload?.code ?? payload?.data?.orderCode;
    if (!orderCode) return;

    const pago = await this.pagoRepo.findOne({
      where: { orderCode },
      relations: ['empresa'],
    });

    if (!pago) {
      // Podría ser una recarga recurrente de N1CO con nuevo orderCode
      // Intentar identificar por planId si está disponible en el payload
      const planId = payload?.planId ?? payload?.data?.planId ?? payload?.plan?.planId;
      if (planId) {
        await this.procesarWebhookRecurrenteExtra(payload, planId);
      } else {
        this.logger.warn(`Webhook: orderCode ${orderCode} no encontrado en pagos`);
      }
      return;
    }

    pago.webhookData = payload;

    const status = (payload?.status ?? payload?.data?.status ?? '').toString().toUpperCase();
    if (status === 'PAID' || status === 'FINALIZED' || status === 'ACTIVE') {
      if (pago.tipo === 'EXTRA') {
        await this.confirmarPagoExtra(pago, payload);
      } else {
        await this.confirmarPago(pago, payload);
      }
    } else if (status === 'CANCELLED' || status === 'FAILED') {
      pago.estado = EstadoPago.FALLIDO;
      await this.pagoRepo.save(pago);
    }
  }

  /**
   * Maneja webhooks recurrentes de N1CO para paquetes extra permanentes.
   * Ocurre cuando N1CO genera una nueva orden para el cobro mensual automático.
   */
  private async procesarWebhookRecurrenteExtra(payload: any, planId: number): Promise<void> {
    const orderCode = payload?.orderCode ?? payload?.code ?? payload?.data?.orderCode;

    // Buscar el catálogo que tenga este planId como permanente
    const catalogo = await this.catalogoRepo.findOne({
      where: { n1coPlanIdPermanente: planId },
    });

    if (!catalogo) {
      this.logger.warn(
        `Webhook recurrente: planId ${planId} no corresponde a ningún ítem del catálogo`,
      );
      return;
    }

    // Intentar identificar la empresa desde un pago previo con el mismo planId en permanente
    const pagoAnterior = await this.pagoRepo.findOne({
      where: { n1coPlanId: planId, tipo: 'EXTRA', esPermanente: true, estado: EstadoPago.PAGADO },
      order: { createdAt: 'DESC' },
      relations: ['empresa'],
    });

    if (!pagoAnterior) {
      this.logger.warn(
        `Webhook recurrente: no se encontró pago anterior para planId ${planId}`,
      );
      return;
    }

    const empresa = pagoAnterior.empresa;

    // Crear nuevo PaqueteExtraDte y PagoN1co para este ciclo
    const paquete = this.paqueteExtraDteRepo.create({
      empresaId:    empresa.id,
      cantidad:     catalogo.cantidad,
      precio:       Number(catalogo.precio),
      esPermanente: true,
      estado:       'PENDIENTE',
      activo:       false,
      notas:        'Cobro recurrente automático N1CO',
    });
    await this.paqueteExtraDteRepo.save(paquete);

    const pago = this.pagoRepo.create({
      empresa,
      planTipo:       'EXTRA',
      tipo:           'EXTRA',
      n1coPlanId:     planId,
      orderCode,
      paymentLinkUrl: catalogo.paymentLinkPermanente,
      monto:          Number(catalogo.precio),
      estado:         EstadoPago.PAGADO,
      meses:          1,
      paqueteExtraId: paquete.id,
      esPermanente:   true,
      webhookData:    payload,
    });
    await this.pagoRepo.save(pago);

    await this.paquetesExtras.activarPaquete(paquete.id);

    this.logger.log(
      `Cobro recurrente N1CO procesado: empresa=${empresa.id} catalogo=${catalogo.id} ` +
      `planId=${planId} orderCode=${orderCode}`,
    );
  }

  /** Activa/renueva la suscripción de la empresa */
  private async confirmarPago(pago: PagoN1co, ordenData: any): Promise<void> {
    pago.estado = EstadoPago.PAGADO;
    pago.webhookData = ordenData;
    await this.pagoRepo.save(pago);

    // Obtener config del plan para pasar límites correctos
    let planDef: PlanConfig | null = null;
    try {
      planDef = await this.planConfigRepo.findOne({ where: { tipo: pago.planTipo } });
    } catch { /* si no existe el plan, usará defaults */ }

    const hoy = new Date();
    const vencimiento = new Date(hoy);
    vencimiento.setMonth(vencimiento.getMonth() + pago.meses);

    const suscripcionActiva = await this.suscripciones.obtenerSuscripcionActiva(pago.empresa.id);

    if (suscripcionActiva) {
      if (suscripcionActiva.tipo !== pago.planTipo) {
        await this.suscripciones.actualizarEstado(suscripcionActiva.id, EstadoSuscripcion.CANCELADA);
      } else {
        await this.suscripciones.renovarSuscripcion(suscripcionActiva.id, vencimiento);
        this.logger.log(`Suscripción renovada: empresa=${pago.empresa.id} hasta=${vencimiento.toISOString()}`);
        return;
      }
    }

    await this.suscripciones.crearSuscripcion(pago.empresa.id, {
      tipo:                pago.planTipo,
      fechaInicio:         hoy,
      fechaVencimiento:    vencimiento,
      precioMensual:       pago.monto,
      limiteDtesMensuales: planDef?.limiteDtesMensuales,
      limiteUsuarios:      planDef?.limiteUsuarios,
    });

    this.logger.log(`Suscripción creada: empresa=${pago.empresa.id} plan=${pago.planTipo} hasta=${vencimiento.toISOString()}`);
  }

  /** Activa un paquete extra de DTEs tras confirmación de pago */
  private async confirmarPagoExtra(pago: PagoN1co, ordenData: any): Promise<void> {
    pago.estado = EstadoPago.PAGADO;
    pago.webhookData = ordenData;
    await this.pagoRepo.save(pago);

    if (pago.paqueteExtraId) {
      try {
        await this.paquetesExtras.activarPaquete(pago.paqueteExtraId);
        this.logger.log(
          `Paquete extra activado: empresa=${pago.empresa.id} paqueteId=${pago.paqueteExtraId}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Error activando paquete extra ${pago.paqueteExtraId}: ${err.message}`,
        );
      }
    } else {
      this.logger.warn(
        `Pago extra ${pago.id} confirmado pero sin paqueteExtraId asociado`,
      );
    }
  }

  /** Devuelve plan actual + uso de la empresa */
  async miPlan(empresaId: string) {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const suscripcion = await this.suscripciones.obtenerSuscripcionActiva(empresaId);
    const uso = await this.suscripciones.verificarLimiteDtes(empresaId);

    const hoy = new Date();
    const diasRestantes = suscripcion
      ? (suscripcion.fechaVencimiento ? Math.max(0, Math.ceil((new Date(suscripcion.fechaVencimiento).getTime() - hoy.getTime()) / 86_400_000)) : 99999)
      : 0;

    return {
      empresa: {
        nombre:    empresa.nombreComercial || empresa.nombreLegal,
        pagoAlDia: empresa.pagoAlDia,
      },
      suscripcion: suscripcion
        ? {
            id:                  suscripcion.id,
            tipo:                suscripcion.tipo,
            estado:              suscripcion.estado,
            fechaInicio:         suscripcion.fechaInicio,
            fechaVencimiento:    suscripcion.fechaVencimiento,
            diasRestantes,
            precioMensual:       suscripcion.precioMensual,
            limiteDtesMensuales: suscripcion.limiteDtesMensuales,
            limiteUsuarios:      suscripcion.limiteUsuarios,
          }
        : null,
      uso: {
        dtesUsados: uso.usados,
        dtesLimite: uso.limite,
        porcentaje: uso.limite > 0 ? Math.round((uso.usados / uso.limite) * 100) : 0,
      },
      planesDisponibles: await this.listarPlanesConfig(),
    };
  }

  /** Historial de pagos de una empresa */
  async historial(empresaId: string): Promise<PagoN1co[]> {
    return this.pagoRepo.find({
      where: { empresa: { id: empresaId } },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  /** Historial global (superadmin) */
  async historialGlobal(): Promise<PagoN1co[]> {
    return this.pagoRepo.find({
      relations: ['empresa'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * Superadmin: asigna manualmente un plan a una empresa sin cobro.
   */
  async asignarPlanManual(
    empresaId: string,
    planTipo: string,
    meses: number = 1,
  ): Promise<{ mensaje: string; fechaVencimiento: Date | null }> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const planDef = await this.getPlanConfig(planTipo);

    const hoy = new Date();
    // CUSTOM: sin vencimiento (acceso ilimitado / cortesía)
    const esCustom = planTipo.toUpperCase() === 'CUSTOM';
    const vencimiento = esCustom ? null : new Date(hoy);
    if (!esCustom) vencimiento!.setMonth(vencimiento!.getMonth() + meses);

    const suscripcionActiva = await this.suscripciones.obtenerSuscripcionActiva(empresaId);
    if (suscripcionActiva) {
      await this.suscripciones.actualizarEstado(suscripcionActiva.id, EstadoSuscripcion.CANCELADA);
    }

    await this.suscripciones.crearSuscripcion(empresaId, {
      tipo:                planTipo,
      fechaInicio:         hoy,
      fechaVencimiento:    vencimiento,
      precioMensual:       Number(planDef.precioMensual),
      limiteDtesMensuales: planDef.limiteDtesMensuales,
      limiteUsuarios:      planDef.limiteUsuarios,
    });

    empresa.pagoAlDia = true;
    await this.empresaRepo.save(empresa);

    this.logger.log(`Plan asignado manualmente: empresa=${empresaId} plan=${planTipo}${esCustom ? ' (sin vencimiento)' : ` meses=${meses}`}`);

    return {
      mensaje: esCustom
        ? `Plan Ilimitado / Cortesía asignado. Sin fecha de vencimiento.`
        : `Plan ${planDef.nombre} asignado por ${meses} mes(es). Vence: ${vencimiento!.toLocaleDateString('es-SV')}`,
      fechaVencimiento: vencimiento,
    };
  }

  /**
   * Asigna el plan inicial a una empresa recién creada (si hay uno configurado).
   * Llamar desde TenantsService después de crear la empresa.
   */
  async asignarPlanInicialSiCorresponde(empresaId: string): Promise<void> {
    const planInicial = await this.getPlanInicial();
    if (!planInicial) return;

    const hoy = new Date();
    const vencimiento = new Date(hoy);
    vencimiento.setMonth(vencimiento.getMonth() + 1);

    try {
      await this.suscripciones.crearSuscripcion(empresaId, {
        tipo:                planInicial.tipo,
        fechaInicio:         hoy,
        fechaVencimiento:    vencimiento,
        precioMensual:       Number(planInicial.precioMensual),
        limiteDtesMensuales: planInicial.limiteDtesMensuales,
        limiteUsuarios:      planInicial.limiteUsuarios,
        notas:               'Plan inicial asignado automáticamente',
      });
      this.logger.log(`Plan inicial "${planInicial.tipo}" asignado a empresa ${empresaId}`);
    } catch (err: any) {
      this.logger.warn(`No se pudo asignar plan inicial a empresa ${empresaId}: ${err.message}`);
    }
  }
}
