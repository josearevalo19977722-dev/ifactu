import {
  Injectable, BadRequestException, Inject, forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaqueteExtraDte } from './entities/paquete-extra-dte.entity';
import { SuscripcionesService } from '../empresa/services/suscripciones.service';

/** Tabla de precios: DTEs → precio en USD */
export const PRECIOS_EXTRA: Record<number, number> = {
  50:  5,
  100: 9,
  200: 16,
  500: 35,
};

/** Devuelve el precio calculado. Lanza si la cantidad no está en la tabla. */
export function calcularPrecio(cantidad: number): number {
  const precio = PRECIOS_EXTRA[cantidad];
  if (precio === undefined) {
    throw new BadRequestException(
      `Cantidad ${cantidad} no es válida. Opciones: ${Object.keys(PRECIOS_EXTRA).join(', ')} DTEs.`,
    );
  }
  return precio;
}

@Injectable()
export class PaquetesExtrasService {
  constructor(
    @InjectRepository(PaqueteExtraDte)
    private readonly repo: Repository<PaqueteExtraDte>,

    @Inject(forwardRef(() => SuscripcionesService))
    private readonly suscripcionesService: SuscripcionesService,
  ) {}

  /** Suma de (cantidad - usado) para paquetes activos y pagados. */
  async getDisponibles(empresaId: string): Promise<{ disponibles: number; paquetes: PaqueteExtraDte[] }> {
    const paquetes = await this.repo.find({
      where: { empresaId, activo: true, estado: 'PAGADO' },
      order: { createdAt: 'ASC' },
    });

    const disponibles = paquetes.reduce((sum, p) => sum + (p.cantidad - p.usado), 0);
    return { disponibles, paquetes };
  }

  /** Crea una solicitud de paquete en estado PENDIENTE (empresa solicita, precio del catálogo). */
  async crearSolicitud(
    empresaId: string,
    dto: { cantidad: number; esPermanente: boolean; notas?: string },
  ): Promise<PaqueteExtraDte> {
    const precio = calcularPrecio(dto.cantidad);

    const paquete = this.repo.create({
      empresaId,
      cantidad: dto.cantidad,
      precio,
      esPermanente: dto.esPermanente,
      notas: dto.notas ?? null,
      estado: 'PENDIENTE',
      activo: false,
    });

    return this.repo.save(paquete);
  }

  /** Superadmin crea un paquete con cantidad y precio libres (sin validar catálogo). */
  async crearPaqueteLibre(
    empresaId: string,
    dto: { cantidad: number; precio: number; esPermanente: boolean; notas?: string },
  ): Promise<PaqueteExtraDte> {
    const paquete = this.repo.create({
      empresaId,
      cantidad: dto.cantidad,
      precio: dto.precio,
      esPermanente: dto.esPermanente,
      notas: dto.notas ?? null,
      estado: 'PENDIENTE',
      activo: false,
    });
    return this.repo.save(paquete);
  }

  /**
   * Activa un paquete (marca como PAGADO).
   * Si esPermanente, también incrementa el límite mensual de la suscripción.
   */
  async activarPaquete(paqueteId: string): Promise<PaqueteExtraDte> {
    const paquete = await this.repo.findOne({ where: { id: paqueteId } });
    if (!paquete) throw new BadRequestException('Paquete no encontrado');
    if (paquete.estado === 'PAGADO') throw new BadRequestException('El paquete ya está activo');
    if (paquete.estado === 'CANCELADO') throw new BadRequestException('El paquete fue cancelado');

    paquete.estado = 'PAGADO';
    paquete.activo = true;

    if (paquete.esPermanente) {
      const suscripcion = await this.suscripcionesService.obtenerSuscripcionActiva(paquete.empresaId);
      if (suscripcion) {
        await this.suscripcionesService.incrementarLimiteDtes(
          suscripcion.id,
          paquete.cantidad,
        );
      }
    }

    return this.repo.save(paquete);
  }

  /**
   * Consume un DTE del paquete más antiguo disponible.
   * Se llama cuando la empresa ya superó su límite del plan pero tiene extras.
   */
  async consumirDte(empresaId: string): Promise<void> {
    const paquetes = await this.repo.find({
      where: { empresaId, activo: true, estado: 'PAGADO' },
      order: { createdAt: 'ASC' },
    });

    for (const p of paquetes) {
      if (p.usado < p.cantidad) {
        p.usado += 1;
        // Si se agotó, marcar como inactivo
        if (p.usado >= p.cantidad) {
          p.activo = false;
        }
        await this.repo.save(p);
        return;
      }
    }

    throw new BadRequestException('No hay DTEs extras disponibles');
  }

  /** Cancela un paquete pendiente o pagado. */
  async cancelarPaquete(paqueteId: string): Promise<PaqueteExtraDte> {
    const paquete = await this.repo.findOne({ where: { id: paqueteId } });
    if (!paquete) throw new BadRequestException('Paquete no encontrado');

    paquete.estado = 'CANCELADO';
    paquete.activo = false;
    return this.repo.save(paquete);
  }

  /** Modifica los datos de un paquete PENDIENTE. */
  async actualizarPaquete(
    paqueteId: string,
    dto: { cantidad?: number; precio?: number; esPermanente?: boolean; notas?: string },
  ): Promise<PaqueteExtraDte> {
    const paquete = await this.repo.findOne({ where: { id: paqueteId } });
    if (!paquete) throw new BadRequestException('Paquete no encontrado');
    if (paquete.estado !== 'PENDIENTE') {
      throw new BadRequestException('Solo se pueden modificar paquetes en estado PENDIENTE');
    }

    if (dto.cantidad !== undefined) {
      paquete.cantidad = dto.cantidad;
      // Recalcular precio solo si es una cantidad estándar del catálogo y no se envió precio explícito
      if (dto.precio === undefined && PRECIOS_EXTRA[dto.cantidad] !== undefined) {
        paquete.precio = PRECIOS_EXTRA[dto.cantidad];
      }
    }
    if (dto.precio !== undefined) paquete.precio = dto.precio;
    if (dto.esPermanente !== undefined) paquete.esPermanente = dto.esPermanente;
    if (dto.notas !== undefined) paquete.notas = dto.notas;

    return this.repo.save(paquete);
  }

  /** Lista todos los paquetes (para el panel de superadmin). */
  async listarTodos(soloActivos = false): Promise<PaqueteExtraDte[]> {
    const where = soloActivos ? { estado: 'PENDIENTE' } : {};
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /** Lista paquetes de una empresa específica. */
  async listarPorEmpresa(empresaId: string): Promise<PaqueteExtraDte[]> {
    return this.repo.find({
      where: { empresaId },
      order: { createdAt: 'DESC' },
    });
  }
}
