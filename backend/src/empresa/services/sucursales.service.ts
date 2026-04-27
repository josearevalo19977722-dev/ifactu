import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../entities/empresa.entity';
import { Sucursal } from '../entities/sucursal.entity';
import { Dte } from '../../dte/entities/dte.entity';
import { PuntoVenta } from '../entities/punto-venta.entity';
import { SuscripcionesService } from './suscripciones.service';
import type { CreateSucursalDto } from '../dto/sucursal.dto';
import type { CreatePuntoVentaDto, UpdatePuntoVentaDto } from '../dto/punto-venta.dto';

export type EmisionCatalogoContext = {
  codEstable: string;
  codPuntoVenta: string;
  /** null = emisión en establecimiento matriz (identificadores fiscales de empresa) */
  sucursal: Sucursal | null;
  /** null si matriz o sucursal sin fila PV coincidente (legacy: solo PV matriz) */
  puntoVenta: PuntoVenta | null;
};

@Injectable()
export class SucursalesService {
  constructor(
    @InjectRepository(Sucursal)
    private readonly repo: Repository<Sucursal>,
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    @InjectRepository(PuntoVenta)
    private readonly pvRepo: Repository<PuntoVenta>,
    private readonly suscripciones: SuscripcionesService,
  ) {}

  findAll(empresaId: string): Promise<Sucursal[]> {
    return this.repo.find({
      where: { empresaId },
      order: { codEstableMh: 'ASC' },
      relations: ['puntosVenta'],
    });
  }

  /** Normaliza código MH: numérico rellena a 4 dígitos; alfanumérico debe ser 4 caracteres. */
  normalizeCodEstable(cod: string): string {
    const t = cod.trim().toUpperCase();
    if (t.length < 1 || t.length > 4) {
      throw new BadRequestException(
        'El código de establecimiento MH debe tener entre 1 y 4 caracteres.',
      );
    }
    if (/^\d+$/.test(t)) {
      return t.padStart(4, '0');
    }
    if (t.length !== 4) {
      throw new BadRequestException(
        'Los códigos alfanuméricos deben tener 4 caracteres (ej. M001, S001).',
      );
    }
    return t;
  }

  /** Normaliza punto de venta MH (trim + mayúsculas; 1–15 caracteres). */
  normalizeCodPuntoVenta(cod: string): string {
    const t = cod.trim().toUpperCase();
    if (t.length < 1 || t.length > 15) {
      throw new BadRequestException('El código de punto de venta MH debe tener entre 1 y 15 caracteres.');
    }
    return t;
  }

  async create(empresaId: string, dto: CreateSucursalDto): Promise<Sucursal> {
    const sus = await this.suscripciones.obtenerSuscripcionActiva(empresaId);
    const limite = sus?.limiteSucursales ?? 999999;
    const count = await this.repo.count({ where: { empresaId } });
    if (count >= limite) {
      throw new BadRequestException(
        `Se alcanzó el límite de sucursales del plan actual (${limite}).`,
      );
    }

    const codEstableMh = this.normalizeCodEstable(dto.codEstableMh);
    const dupe = await this.repo.findOne({ where: { empresaId, codEstableMh } });
    if (dupe) {
      throw new BadRequestException('Ya existe una sucursal con ese código de establecimiento.');
    }

    const empresa = await this.repo.manager.getRepository(Empresa).findOne({ where: { id: empresaId } });
    if (empresa && this.normalizeCodEstable(empresa.codEstableMh || '0001') === codEstableMh) {
      throw new BadRequestException(
        'Ese código corresponde al establecimiento matriz (identificadores fiscales). No debe duplicarse como sucursal.',
      );
    }

    const s = this.repo.create({
      nombre: dto.nombre.trim(),
      direccion: dto.direccion.trim(),
      telefono: dto.telefono?.trim() || null,
      codEstableMh,
      empresaId,
    });
    return this.repo.save(s);
  }

  async update(
    id: string,
    empresaId: string,
    dto: Partial<Pick<CreateSucursalDto, 'nombre' | 'direccion' | 'telefono' | 'codEstableMh'>>,
  ): Promise<Sucursal> {
    const s = await this.repo.findOne({ where: { id, empresaId } });
    if (!s) throw new NotFoundException('Sucursal no encontrada');

    if (dto.nombre != null) s.nombre = dto.nombre.trim();
    if (dto.direccion != null) s.direccion = dto.direccion.trim();
    if (dto.telefono !== undefined) s.telefono = dto.telefono?.trim() || null;
    if (dto.codEstableMh != null) {
      const codEstableMh = this.normalizeCodEstable(dto.codEstableMh);
      const clash = await this.repo.findOne({ where: { empresaId, codEstableMh } });
      if (clash && clash.id !== s.id) {
        throw new BadRequestException('Ya existe otra sucursal con ese código de establecimiento.');
      }
      const empresa = await this.repo.manager.getRepository(Empresa).findOne({ where: { id: empresaId } });
      if (empresa && this.normalizeCodEstable(empresa.codEstableMh || '0001') === codEstableMh) {
        throw new BadRequestException(
          'Ese código corresponde al establecimiento matriz (identificadores fiscales).',
        );
      }
      s.codEstableMh = codEstableMh;
    }

    return this.repo.save(s);
  }

  /**
   * Valida par establecimiento + punto de venta contra identificadores fiscales y catálogo
   * (sucursales + puntos de venta). Usado en emisión CF/CCF y POS.
   */
  async resolverEmisionCatalogo(
    empresa: Empresa,
    codEstableRaw: string,
    codPuntoVentaRaw: string,
  ): Promise<EmisionCatalogoContext> {
    let ce: string;
    let cv: string;
    try {
      ce = this.normalizeCodEstable(codEstableRaw);
      cv = this.normalizeCodPuntoVenta(codPuntoVentaRaw);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Códigos MH de establecimiento o punto de venta inválidos.');
    }

    const baseCe = this.normalizeCodEstable(empresa.codEstableMh || '0001');
    const baseCv = this.normalizeCodPuntoVenta(empresa.codPuntoVentaMh || 'P001');

    if (ce === baseCe) {
      if (cv !== baseCv) {
        throw new BadRequestException(
          `Para el establecimiento matriz (${baseCe}), el punto de venta debe ser «${baseCv}» (configurado en Identificadores fiscales).`,
        );
      }
      return { codEstable: ce, codPuntoVenta: cv, sucursal: null, puntoVenta: null };
    }

    const suc = await this.repo.findOne({ where: { empresaId: empresa.id, codEstableMh: ce } });
    if (!suc) {
      throw new BadRequestException(
        `El establecimiento MH «${ce}» no está permitido: debe coincidir con los identificadores de la empresa o con una sucursal registrada en Configuración.`,
      );
    }

    const pvs = await this.pvRepo.find({
      where: { sucursalId: suc.id },
      order: { codPuntoVentaMh: 'ASC' },
    });

    if (pvs.length === 0) {
      if (cv !== baseCv) {
        throw new BadRequestException(
          `La sucursal «${ce}» no tiene puntos de venta registrados en iFactu. ` +
            `Agrega al menos uno en Configuración, o usa temporalmente el punto de venta «${baseCv}» si coincide con Hacienda.`,
        );
      }
      return { codEstable: ce, codPuntoVenta: cv, sucursal: suc, puntoVenta: null };
    }

    const pv = pvs.find((p) => this.normalizeCodPuntoVenta(p.codPuntoVentaMh) === cv);
    if (!pv) {
      const permitidos = pvs.map((p) => p.codPuntoVentaMh).join(', ');
      throw new BadRequestException(
        `El punto de venta «${cv}» no está registrado para el establecimiento «${ce}». Permitidos: ${permitidos}.`,
      );
    }

    return { codEstable: ce, codPuntoVenta: cv, sucursal: suc, puntoVenta: pv };
  }

  // ── Puntos de venta (por sucursal) ─────────────────────────────────────────

  async listPuntosVenta(sucursalId: string, empresaId: string): Promise<PuntoVenta[]> {
    const suc = await this.repo.findOne({ where: { id: sucursalId, empresaId } });
    if (!suc) throw new NotFoundException('Sucursal no encontrada');
    return this.pvRepo.find({
      where: { sucursalId },
      order: { codPuntoVentaMh: 'ASC' },
    });
  }

  async createPuntoVenta(
    empresaId: string,
    sucursalId: string,
    dto: CreatePuntoVentaDto,
  ): Promise<PuntoVenta> {
    const suc = await this.repo.findOne({ where: { id: sucursalId, empresaId } });
    if (!suc) throw new NotFoundException('Sucursal no encontrada');

    const codPuntoVentaMh = this.normalizeCodPuntoVenta(dto.codPuntoVentaMh);
    const dupe = await this.pvRepo.findOne({ where: { sucursalId, codPuntoVentaMh } });
    if (dupe) {
      throw new BadRequestException('Ya existe un punto de venta con ese código en esta sucursal.');
    }

    const pv = this.pvRepo.create({
      nombre: dto.nombre.trim(),
      codPuntoVentaMh,
      sucursalId,
      activo: dto.activo !== false,
    });
    return this.pvRepo.save(pv);
  }

  async updatePuntoVenta(
    empresaId: string,
    id: string,
    dto: UpdatePuntoVentaDto,
  ): Promise<PuntoVenta> {
    const pv = await this.pvRepo.findOne({
      where: { id },
      relations: ['sucursal'],
    });
    if (!pv || pv.sucursal.empresaId !== empresaId) {
      throw new NotFoundException('Punto de venta no encontrado');
    }

    if (dto.nombre != null) pv.nombre = dto.nombre.trim();
    if (dto.activo !== undefined) pv.activo = dto.activo;
    if (dto.codPuntoVentaMh != null) {
      const codPuntoVentaMh = this.normalizeCodPuntoVenta(dto.codPuntoVentaMh);
      const clash = await this.pvRepo.findOne({
        where: { sucursalId: pv.sucursalId, codPuntoVentaMh },
      });
      if (clash && clash.id !== pv.id) {
        throw new BadRequestException('Ya existe otro punto de venta con ese código en esta sucursal.');
      }
      pv.codPuntoVentaMh = codPuntoVentaMh;
    }

    return this.pvRepo.save(pv);
  }

  async removePuntoVenta(empresaId: string, id: string): Promise<void> {
    const pv = await this.pvRepo.findOne({
      where: { id },
      relations: ['sucursal'],
    });
    if (!pv || pv.sucursal.empresaId !== empresaId) {
      throw new NotFoundException('Punto de venta no encontrado');
    }

    const n = await this.dteRepo
      .createQueryBuilder('d')
      .where('d.puntoVentaId = :id', { id })
      .getCount();
    if (n > 0) {
      throw new BadRequestException('No se puede eliminar: hay DTEs asociados a este punto de venta.');
    }

    await this.pvRepo.remove(pv);
  }

  async remove(id: string, empresaId: string): Promise<void> {
    const s = await this.repo.findOne({ where: { id, empresaId } });
    if (!s) throw new NotFoundException('Sucursal no encontrada');

    const pv = await this.pvRepo.count({ where: { sucursalId: id } });
    if (pv > 0) {
      throw new BadRequestException(
        'No se puede eliminar: hay puntos de venta asociados a esta sucursal.',
      );
    }

    const dtes = await this.dteRepo
      .createQueryBuilder('d')
      .where('d.sucursalId = :id', { id })
      .getCount();
    if (dtes > 0) {
      throw new BadRequestException(
        'No se puede eliminar: hay DTEs asociados a esta sucursal.',
      );
    }

    await this.repo.remove(s);
  }
}
