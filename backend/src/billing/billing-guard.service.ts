import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../empresa/entities/empresa.entity';
import { Suscripcion, EstadoSuscripcion } from '../empresa/entities/suscripcion.entity';

@Injectable()
export class BillingGuardService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @InjectRepository(Suscripcion)
    private readonly suscripcionRepo: Repository<Suscripcion>,
  ) {}

  /**
   * Verifica que la empresa puede emitir un DTE.
   * Lanza ForbiddenException si:
   *  - No tiene suscripción activa
   *  - Superó el límite mensual de DTEs
   *
   * Se llama al inicio de cada servicio de emisión.
   */
  async verificarPuedeEmitir(empresaId: string): Promise<void> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) return; // Si no existe la empresa, el propio servicio lanzará error

    // Resetear contador si cambió el mes
    this.resetearSiCambioMes(empresa);

    // Buscar suscripción activa
    const suscripcion = await this.suscripcionRepo.findOne({
      where: { empresa: { id: empresaId }, estado: EstadoSuscripcion.ACTIVA },
      order: { createdAt: 'DESC' },
    });

    if (!suscripcion) {
      throw new ForbiddenException(
        'Tu empresa no tiene un plan activo. Contrata un plan en Configuración → Mi Plan para continuar emitiendo DTEs.',
      );
    }

    if (empresa.dtesEmitidosMes >= suscripcion.limiteDtesMensuales) {
      throw new ForbiddenException(
        `Has alcanzado el límite de ${suscripcion.limiteDtesMensuales} DTEs mensuales de tu plan ${suscripcion.tipo}. ` +
        `El contador se reinicia el 1° del próximo mes. Para emitir más DTEs ahora, mejora tu plan.`,
      );
    }

    // Guardar si el mes cambió
    await this.empresaRepo.save(empresa);
  }

  /** Incrementa el contador de DTEs de la empresa */
  async incrementarContador(empresaId: string): Promise<void> {
    await this.empresaRepo
      .createQueryBuilder()
      .update(Empresa)
      .set({ dtesEmitidosMes: () => 'dtes_emitidos_mes + 1' })
      .where('id = :id', { id: empresaId })
      .execute();
  }

  private resetearSiCambioMes(empresa: Empresa): void {
    const ahora    = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();

    if (empresa.ultimoResetContador) {
      const ultimo = new Date(empresa.ultimoResetContador);
      if (ultimo.getMonth() !== mesActual || ultimo.getFullYear() !== anioActual) {
        empresa.dtesEmitidosMes     = 0;
        empresa.ultimoResetContador = ahora;
      }
    } else {
      empresa.dtesEmitidosMes     = 0;
      empresa.ultimoResetContador = ahora;
    }
  }
}
