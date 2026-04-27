import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dte, EstadoDte } from '../../dte/entities/dte.entity';
import { ConsultaMhService } from '../../dte/services/consulta-mh.service';
import { CertificadosService } from '../../empresa/services/certificados.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly consultaMhService: ConsultaMhService,
    private readonly certificadosService: CertificadosService,
  ) {}

  /**
   * Procesa lotes pendientes cada 5 minutos.
   * Busca DTEs en estado PENDIENTE que tengan un codigoLote en las observaciones.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleLotPolling() {
    this.logger.log('Iniciando polling de lotes MH...');

    const dtesPendientes = await this.dteRepo
      .createQueryBuilder('dte')
      .leftJoinAndSelect('dte.empresa', 'empresa')
      .where('dte.estado = :estado', { estado: EstadoDte.PENDIENTE })
      .andWhere('dte.observaciones LIKE :pattern', { pattern: '%codigoLote: %' })
      .getMany();

    if (dtesPendientes.length === 0) {
      return;
    }

    // Agrupar por codigoLote para no consultar el mismo lote varias veces
    const lotesMap = new Map<string, any>();
    for (const dte of dtesPendientes) {
      const match = dte.observaciones?.match(/codigoLote: ([A-Z0-9-]+)/);
      if (match && match[1]) {
        lotesMap.set(match[1], dte.empresa);
      }
    }

    for (const [codigoLote, empresa] of lotesMap.entries()) {
      try {
        this.logger.log(`Consultando resultado para lote ${codigoLote} (Empresa: ${empresa.nombreLegal})`);
        await this.consultaMhService.procesarResultadoLote(codigoLote, empresa);
      } catch (err) {
        this.logger.error(`Error al procesar lote ${codigoLote}: ${err.message}`);
      }
    }
  }

  /**
   * Verifica vencimiento de certificados diariamente a la medianoche.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCertificateChecks() {
    this.logger.log('Verificando vencimiento de certificados...');

    const porVencer = await this.certificadosService.obtenerCertificadosPorVencer(30);
    for (const cert of porVencer) {
      this.logger.warn(
        `CERTIFICADO POR VENCER: Empresa ${cert.empresa.nombreLegal}, ` +
        `Vence en ${cert.diasRestantes} días (${cert.fechaVencimiento})`
      );
      // Aquí se podría enviar un email real
    }

    const vencidos = await this.certificadosService.obtenerVencidos();
    for (const cert of vencidos) {
      this.logger.error(`CERTIFICADO VENCIDO: Empresa ${cert.empresa.nombreLegal} (${cert.fechaVencimiento})`);
      // Desactivar si es necesario
      await this.certificadosService.desactivar(cert.id, cert.empresaId);
    }
  }
}
