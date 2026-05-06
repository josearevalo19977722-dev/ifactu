import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { isCodigoPaisCat020 } from '../catalogs/paises-cat020';
import { Contacto } from './contacto.entity';

@Injectable()
export class ContactosService {
  constructor(
    @InjectRepository(Contacto) private readonly repo: Repository<Contacto>,
  ) {}

  async crear(dto: Partial<Contacto>, empresaId: string): Promise<Contacto> {
    this.validarCodPaisOpcional(dto.codPais);
    return this.repo.save(this.repo.create({ ...dto, empresaId }));
  }

  async listar(params: { tipo?: string; q?: string; page?: number; limit?: number; empresaId: string }) {
    const { tipo, q, page = 1, limit = 20, empresaId } = params;
    const qb = this.repo.createQueryBuilder('c')
      .where('c.empresaId = :empresaId', { empresaId });
    if (tipo) qb.andWhere('c.tipo = :tipo', { tipo });
    if (q) {
      const term = `%${q.toLowerCase()}%`;
      qb.andWhere(new Brackets(w =>
        w.where('LOWER(c.nombre) LIKE :term', { term })
          .orWhere('LOWER(c.nit) LIKE :term', { term })
          .orWhere('LOWER(c.numDocumento) LIKE :term', { term })
      ));
    }
    return qb.orderBy('c.nombre', 'ASC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();
  }

  async buscar(q: string, empresaId: string): Promise<Contacto[]> {
    if (!q || q.length < 2) return [];
    const term = `%${q.toLowerCase()}%`;
    return this.repo.createQueryBuilder('c')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere(new Brackets(w =>
        w.where('LOWER(c.nombre) LIKE :term', { term })
          .orWhere('LOWER(c.nit) LIKE :term', { term })
          .orWhere('LOWER(c.numDocumento) LIKE :term', { term })
      ))
      .orderBy('c.nombre').limit(10).getMany();
  }

  async obtener(id: string, empresaId: string): Promise<Contacto> {
    const c = await this.repo.findOne({ where: { id, empresaId } });
    if (!c) throw new NotFoundException('Contacto no encontrado');
    return c;
  }

  async actualizar(id: string, dto: Partial<Contacto>, empresaId: string): Promise<Contacto> {
    if (dto.codPais !== undefined) {
      this.validarCodPaisOpcional(dto.codPais);
    }
    // Verificar que el contacto pertenece al tenant antes de actualizar
    await this.obtener(id, empresaId);
    await this.repo.update(id, dto);
    return this.obtener(id, empresaId);
  }

  /** Si viene codPais no vacío, debe existir en CAT-020. */
  private validarCodPaisOpcional(codPais: string | null | undefined): void {
    if (codPais == null || codPais === '') return;
    if (!isCodigoPaisCat020(codPais)) {
      throw new BadRequestException(
        'codPais debe ser un código CAT-020 (ISO 3166-1 alpha-2) válido según el Ministerio de Hacienda.',
      );
    }
  }

  async eliminar(id: string, empresaId: string): Promise<void> {
    // Verificar que el contacto pertenece al tenant antes de eliminar
    await this.obtener(id, empresaId);
    await this.repo.delete(id);
  }
}
