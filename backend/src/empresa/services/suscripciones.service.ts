import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Suscripcion, TipoSuscripcion, EstadoSuscripcion } from '../entities/suscripcion.entity';
import { Empresa } from '../entities/empresa.entity';
import { PaquetesExtrasService } from '../../billing/paquetes-extras.service';

@Injectable()
export class SuscripcionesService {
  constructor(
    @InjectRepository(Suscripcion)
    private readonly suscripcionRepo: Repository<Suscripcion>,
    @InjectRepository(Empresa)
    private readonly empresaRepo: Repository<Empresa>,
    @Inject(forwardRef(() => PaquetesExtrasService))
    private readonly paquetesExtras: PaquetesExtrasService,
  ) {}

  async crearSuscripcion(empresaId: string, dto: {
    tipo: string;
    fechaInicio: Date;
    fechaVencimiento: Date;
    precioMensual?: number;
    notas?: string;
    /** Límites opcionales — si se pasan, sobreescriben los defaults del tipo */
    limiteDtesMensuales?: number;
    limiteUsuarios?: number;
    limiteSucursales?: number;
    limitePuntosVenta?: number;
    permiteExportacion?: boolean;
    permiteMultiMoneda?: boolean;
  }): Promise<Suscripcion> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new BadRequestException('Empresa no encontrada');

    const limites = this.getLimitesPorTipo(dto.tipo as TipoSuscripcion);

    const suscripcion = this.suscripcionRepo.create({
      empresa,
      tipo: dto.tipo,
      fechaInicio: dto.fechaInicio,
      fechaVencimiento: dto.fechaVencimiento,
      precioMensual: dto.precioMensual ?? limites.precioDefault,
      limiteDtesMensuales: dto.limiteDtesMensuales ?? limites.limiteDtes,
      limiteUsuarios: dto.limiteUsuarios ?? limites.limiteUsuarios,
      limiteSucursales: dto.limiteSucursales ?? limites.limiteSucursales,
      limitePuntosVenta: dto.limitePuntosVenta ?? limites.limitePuntosVenta,
      permiteExportacion: dto.permiteExportacion ?? limites.permiteExportacion,
      permiteMultiMoneda: dto.permiteMultiMoneda ?? limites.permiteMultiMoneda,
      notas: dto.notas ?? null,
    });

    return this.suscripcionRepo.save(suscripcion);
  }

  async obtenerSuscripcionActiva(empresaId: string): Promise<Suscripcion | null> {
    return this.suscripcionRepo.findOne({
      where: { empresa: { id: empresaId }, estado: EstadoSuscripcion.ACTIVA },
      order: { createdAt: 'DESC' },
    });
  }

  async verificarLimiteDtes(empresaId: string): Promise<{
    permitido: boolean;
    usados: number;
    limite: number;
    extrasDisponibles: number;
    limitado: boolean;
  }> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new BadRequestException('Empresa no encontrada');

    this.resetearContadorSiCorresponde(empresa);

    const suscripcion = await this.obtenerSuscripcionActiva(empresaId);
    const limite = suscripcion?.limiteDtesMensuales ?? 100;

    const extras = await this.paquetesExtras.getDisponibles(empresaId);
    const totalDisponible = limite - empresa.dtesEmitidosMes + extras.disponibles;

    return {
      permitido: totalDisponible > 0,
      usados: empresa.dtesEmitidosMes,
      limite,
      extrasDisponibles: extras.disponibles,
      limitado: empresa.dtesEmitidosMes >= limite, // true = está usando o necesita usar extras
    };
  }

  async incrementarContadorDte(empresaId: string): Promise<void> {
    const empresa = await this.empresaRepo.findOne({ where: { id: empresaId } });
    if (!empresa) return;

    this.resetearContadorSiCorresponde(empresa);

    const suscripcion = await this.obtenerSuscripcionActiva(empresaId);
    const limite = suscripcion?.limiteDtesMensuales ?? 100;

    if (empresa.dtesEmitidosMes >= limite) {
      // Superó el límite del plan: consumir un DTE del paquete extra
      await this.paquetesExtras.consumirDte(empresaId);
    }

    empresa.dtesEmitidosMes += 1;
    await this.empresaRepo.save(empresa);
  }

  /** Incrementa el límite de DTEs mensuales de una suscripción (para paquetes permanentes). */
  async incrementarLimiteDtes(suscripcionId: string, cantidad: number): Promise<Suscripcion> {
    const suscripcion = await this.suscripcionRepo.findOne({ where: { id: suscripcionId } });
    if (!suscripcion) throw new BadRequestException('Suscripción no encontrada');

    suscripcion.limiteDtesMensuales += cantidad;
    return this.suscripcionRepo.save(suscripcion);
  }

  private resetearContadorSiCorresponde(empresa: Empresa): void {
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();

    if (empresa.ultimoResetContador) {
      const ultimoReset = new Date(empresa.ultimoResetContador);
      if (ultimoReset.getMonth() !== mesActual || ultimoReset.getFullYear() !== anioActual) {
        empresa.dtesEmitidosMes = 0;
        empresa.ultimoResetContador = ahora;
      }
    } else {
      empresa.dtesEmitidosMes = 0;
      empresa.ultimoResetContador = ahora;
    }
  }

  async listarSuscripciones(): Promise<Suscripcion[]> {
    return this.suscripcionRepo.find({
      relations: ['empresa'],
      order: { createdAt: 'DESC' },
    });
  }

  async actualizarEstado(suscripcionId: string, estado: EstadoSuscripcion): Promise<Suscripcion> {
    const suscripcion = await this.suscripcionRepo.findOne({
      where: { id: suscripcionId },
      relations: ['empresa'],
    });
    if (!suscripcion) throw new BadRequestException('Suscripción no encontrada');

    suscripcion.estado = estado;

    if (estado === EstadoSuscripcion.SUSPENDIDA || estado === EstadoSuscripcion.VENCIDA) {
      suscripcion.empresa.activo = false;
      await this.empresaRepo.save(suscripcion.empresa);
    } else if (estado === EstadoSuscripcion.ACTIVA) {
      suscripcion.empresa.activo = true;
      await this.empresaRepo.save(suscripcion.empresa);
    }

    return this.suscripcionRepo.save(suscripcion);
  }

  async renovarSuscripcion(suscripcionId: string, nuevaFechaVencimiento: Date): Promise<Suscripcion> {
    const suscripcion = await this.suscripcionRepo.findOne({
      where: { id: suscripcionId },
      relations: ['empresa'],
    });
    if (!suscripcion) throw new BadRequestException('Suscripción no encontrada');

    suscripcion.fechaVencimiento = nuevaFechaVencimiento;
    suscripcion.estado = EstadoSuscripcion.ACTIVA;
    suscripcion.empresa.activo = true;
    suscripcion.empresa.pagoAlDia = true;

    await this.empresaRepo.save(suscripcion.empresa);
    return this.suscripcionRepo.save(suscripcion);
  }

  private getLimitesPorTipo(tipo: TipoSuscripcion): {
    limiteDtes: number;
    limiteUsuarios: number;
    limiteSucursales: number;
    limitePuntosVenta: number;
    permiteExportacion: boolean;
    permiteMultiMoneda: boolean;
    precioDefault: number;
  } {
    switch (tipo) {
      case TipoSuscripcion.BASICA:
        return {
          limiteDtes: 100,
          limiteUsuarios: 3,
          limiteSucursales: 1,
          limitePuntosVenta: 3,
          permiteExportacion: false,
          permiteMultiMoneda: false,
          precioDefault: 29.99,
        };
      case TipoSuscripcion.PROFESIONAL:
        return {
          limiteDtes: 500,
          limiteUsuarios: 10,
          limiteSucursales: 3,
          limitePuntosVenta: 10,
          permiteExportacion: true,
          permiteMultiMoneda: false,
          precioDefault: 79.99,
        };
      case TipoSuscripcion.EMPRESA:
        return {
          limiteDtes: 2000,
          limiteUsuarios: 50,
          limiteSucursales: 10,
          limitePuntosVenta: 50,
          permiteExportacion: true,
          permiteMultiMoneda: true,
          precioDefault: 199.99,
        };
      case TipoSuscripcion.CUSTOM:
      default:
        return {
          limiteDtes: 999999,
          limiteUsuarios: 999999,
          limiteSucursales: 999999,
          limitePuntosVenta: 999999,
          permiteExportacion: true,
          permiteMultiMoneda: true,
          precioDefault: 0,
        };
    }
  }
}
