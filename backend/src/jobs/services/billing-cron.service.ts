import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { Suscripcion, EstadoSuscripcion } from '../../empresa/entities/suscripcion.entity';

@Injectable()
export class BillingCronService {
  private readonly logger = new Logger(BillingCronService.name);

  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(Suscripcion)
    private readonly suscripcionRepo: Repository<Suscripcion>,
  ) {}

  /**
   * Cada 1° del mes a las 00:05 — resetea el contador de DTEs de TODAS las empresas.
   * NO borra ningún DTE ni suscripción. Solo pone dtes_emitidos_mes = 0
   * para que el plan mensual vuelva a estar disponible.
   */
  @Cron('5 0 1 * *')   // minuto 5, hora 0, día 1 de cada mes
  async resetearContadoresMensuales() {
    this.logger.log('⏰ Ejecutando reset mensual de contadores DTE...');

    const ahora = new Date();
    const result = await this.empresaRepo
      .createQueryBuilder()
      .update(Empresa)
      .set({
        dtesEmitidosMes:      0,
        ultimoResetContador:  ahora,
      })
      .execute();

    this.logger.log(`✅ Reset mensual completado — ${result.affected ?? 0} empresas actualizadas`);
  }

  /**
   * Diariamente a las 00:10 — verifica planes vencidos y los marca como VENCIDA.
   * Desactiva la empresa si su plan expiró.
   */
  @Cron('10 0 * * *')   // minuto 10, hora 0, cada día
  async verificarPlanesVencidos() {
    this.logger.log('🔍 Verificando suscripciones vencidas...');

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Suscripciones activas cuya fecha de vencimiento ya pasó
    const vencidas = await this.suscripcionRepo.find({
      where: {
        estado: EstadoSuscripcion.ACTIVA,
        fechaVencimiento: LessThan(hoy),
      },
      relations: ['empresa'],
    });

    if (vencidas.length === 0) {
      this.logger.log('✅ No hay suscripciones vencidas');
      return;
    }

    for (const suscripcion of vencidas) {
      suscripcion.estado = EstadoSuscripcion.VENCIDA;
      await this.suscripcionRepo.save(suscripcion);

      // Marcar empresa como pago no al día
      suscripcion.empresa.pagoAlDia = false;
      await this.empresaRepo.save(suscripcion.empresa);

      this.logger.warn(
        `⚠️ Plan vencido: empresa="${suscripcion.empresa.nombreLegal}" ` +
        `plan=${suscripcion.tipo} venció=${suscripcion.fechaVencimiento}`,
      );
    }

    this.logger.log(`✅ ${vencidas.length} suscripciones marcadas como VENCIDAS`);
  }

  /**
   * Diariamente a las 09:00 — avisa por log de planes próximos a vencer (7 días).
   * Aquí se puede conectar con el email service cuando esté listo.
   */
  @Cron('0 9 * * *')
  async avisarPlanesProximosAVencer() {
    const en7Dias = new Date();
    en7Dias.setDate(en7Dias.getDate() + 7);

    const porVencer = await this.suscripcionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.empresa', 'empresa')
      .where('s.estado = :estado', { estado: EstadoSuscripcion.ACTIVA })
      .andWhere('s.fechaVencimiento <= :fecha', { fecha: en7Dias })
      .andWhere('s.fechaVencimiento >= :hoy', { hoy: new Date() })
      .getMany();

    for (const s of porVencer) {
      const dias = Math.ceil(
        (new Date(s.fechaVencimiento).getTime() - Date.now()) / 86_400_000,
      );
      this.logger.warn(
        `📅 Plan por vencer: empresa="${s.empresa.nombreLegal}" ` +
        `plan=${s.tipo} — vence en ${dias} día(s)`,
      );
      // TODO: enviar email de aviso al admin de la empresa
    }
  }
}
