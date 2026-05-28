import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Producto } from './producto.entity';
import { MovimientoInventario, TipoMovimiento } from './movimiento.entity';

function n(v: any, dec = 4) {
  return Math.round((Number(v) || 0) * 10 ** dec) / 10 ** dec;
}

export interface ItemCompra {
  descripcion: string;
  cantidad: number;
  costoUnitario: number;  // precioUni del DTE
  unidad?: string;
}

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(Producto)
    private readonly prodRepo: Repository<Producto>,
    @InjectRepository(MovimientoInventario)
    private readonly movRepo: Repository<MovimientoInventario>,
  ) {}

  // ── Productos ────────────────────────────────────────────────────────────────

  async crearProducto(dto: Partial<Producto>, empresaId?: string): Promise<Producto> {
    if (!dto.nombre?.trim()) throw new BadRequestException('El nombre es requerido');
    // Código vacío → null para no violar constraint UNIQUE ('' !== NULL en Postgres)
    if (dto.codigo !== undefined && !dto.codigo?.trim()) dto.codigo = null;
    return this.prodRepo.save(this.prodRepo.create({ ...dto, empresaId: empresaId ?? dto.empresaId ?? null }));
  }

  async listar(params: { q?: string; page?: number; limit?: number; bajoStock?: boolean; empresaId?: string }) {
    const { q, page = 1, limit = 30, bajoStock, empresaId } = params;
    const qb = this.prodRepo.createQueryBuilder('p').where('p.activo = true');

    if (empresaId) qb.andWhere('p."empresaId" = :empresaId', { empresaId });

    if (q) {
      const term = `%${q.toLowerCase()}%`;
      qb.andWhere(new Brackets(w =>
        w.where('LOWER(p.nombre) LIKE :term', { term })
          .orWhere('LOWER(p.codigo) LIKE :term', { term })
          .orWhere('LOWER(p.descripcion) LIKE :term', { term })
      ));
    }
    if (bajoStock) qb.andWhere('p.stockActual <= 0');

    return qb
      .orderBy('p.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  async obtener(id: string, empresaId?: string): Promise<Producto> {
    const where: any = { id };
    if (empresaId) where.empresaId = empresaId;
    const p = await this.prodRepo.findOne({ where });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  async actualizar(id: string, dto: Partial<Producto>, empresaId?: string): Promise<Producto> {
    await this.obtener(id, empresaId);
    if (dto.codigo !== undefined && !dto.codigo?.trim()) dto.codigo = null;
    await this.prodRepo.update(id, dto);
    return this.obtener(id);
  }

  async desactivar(id: string, empresaId?: string): Promise<Producto> {
    return this.actualizar(id, { activo: false }, empresaId);
  }

  /** Busca por nombre exacto (case-insensitive) dentro del tenant. Si no existe, lo crea. */
  async buscarOCrear(nombre: string, unidad = 'UND', empresaId?: string): Promise<Producto> {
    const norm = nombre.trim();
    const qb = this.prodRepo
      .createQueryBuilder('p')
      .where('LOWER(p.nombre) = :n', { n: norm.toLowerCase() });

    if (empresaId) qb.andWhere('p."empresaId" = :empresaId', { empresaId });

    const existe = await qb.getOne();
    if (existe) return existe;
    return this.crearProducto({ nombre: norm, unidad }, empresaId);
  }

  // ── Movimientos ──────────────────────────────────────────────────────────────

  async registrarEntrada(opts: {
    productoId: string;
    cantidad: number;
    costoUnitario: number;
    compraId?: string;
    fecha?: string;
    descripcion?: string;
  }): Promise<MovimientoInventario> {
    const prod = await this.obtener(opts.productoId);
    const cant = n(opts.cantidad);
    const costo = n(opts.costoUnitario);
    if (cant <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');

    // Costo promedio ponderado
    const stockAnterior = n(prod.stockActual);
    const costoAnterior = n(prod.costoUnitario);
    const nuevoStock = n(stockAnterior + cant);
    const nuevoCosto = nuevoStock > 0
      ? n((stockAnterior * costoAnterior + cant * costo) / nuevoStock)
      : costo;

    await this.prodRepo.update(prod.id, {
      stockActual: nuevoStock,
      costoUnitario: nuevoCosto,
    });

    return this.movRepo.save(this.movRepo.create({
      productoId: prod.id,
      tipo: TipoMovimiento.ENTRADA,
      cantidad: cant,
      costoUnitario: costo,
      total: n(cant * costo, 2),
      stockResultante: nuevoStock,
      compraId: opts.compraId ?? null,
      fecha: opts.fecha ?? new Date().toISOString().split('T')[0],
      descripcion: opts.descripcion ?? null,
    }));
  }

  async registrarSalida(opts: {
    productoId: string;
    cantidad: number;
    costoUnitario?: number;
    dteId?: string;
    fecha?: string;
    descripcion?: string;
  }): Promise<MovimientoInventario> {
    const prod = await this.obtener(opts.productoId);
    const cant = n(opts.cantidad);
    const costo = n(opts.costoUnitario ?? prod.costoUnitario);
    if (cant <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');

    const nuevoStock = n(Number(prod.stockActual) - cant);

    await this.prodRepo.update(prod.id, { stockActual: nuevoStock });

    return this.movRepo.save(this.movRepo.create({
      productoId: prod.id,
      tipo: TipoMovimiento.SALIDA,
      cantidad: cant,
      costoUnitario: costo,
      total: n(cant * costo, 2),
      stockResultante: nuevoStock,
      dteId: opts.dteId ?? null,
      fecha: opts.fecha ?? new Date().toISOString().split('T')[0],
      descripcion: opts.descripcion ?? null,
    }));
  }

  /**
   * Descuenta stock por cada ítem de un DTE que tenga código de producto registrado.
   * Los ítems sin código o de tipo Servicio (tipoItem=2) se omiten silenciosamente.
   */
  async descontarStockDte(
    items: Array<{ codigo?: string | null; cantidad: number; descripcion: string; tipoItem?: number }>,
    dteId: string,
    fecha: string,
    empresaId?: string,
  ): Promise<void> {
    for (const item of items) {
      if (!item.codigo || item.tipoItem === 2) continue;
      const where: any = { codigo: item.codigo, activo: true };
      if (empresaId) where.empresaId = empresaId;
      const prod = await this.prodRepo.findOne({ where });
      if (!prod) continue;
      try {
        await this.registrarSalida({
          productoId: prod.id,
          cantidad: item.cantidad,
          dteId,
          fecha,
          descripcion: `Venta DTE — ${item.descripcion}`,
        });
      } catch (err) {
        console.warn(`[StockDte] No se pudo descontar stock de "${item.codigo}": ${err.message}`);
      }
    }
  }

  async ajuste(opts: {
    productoId: string;
    stockNuevo: number;
    descripcion?: string;
    empresaId?: string;
  }): Promise<MovimientoInventario> {
    const prod = await this.obtener(opts.productoId, opts.empresaId);
    const stockNuevo = n(opts.stockNuevo);
    const diff = n(stockNuevo - Number(prod.stockActual));

    await this.prodRepo.update(prod.id, { stockActual: stockNuevo });

    return this.movRepo.save(this.movRepo.create({
      productoId: prod.id,
      tipo: TipoMovimiento.AJUSTE,
      cantidad: Math.abs(diff),
      costoUnitario: n(prod.costoUnitario),
      total: n(Math.abs(diff) * Number(prod.costoUnitario), 2),
      stockResultante: stockNuevo,
      fecha: new Date().toISOString().split('T')[0],
      descripcion: opts.descripcion ?? 'Ajuste manual',
    }));
  }

  async movimientosProducto(productoId: string, page = 1, limit = 30) {
    return this.movRepo.findAndCount({
      where: { productoId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  // ── Procesamiento masivo desde compra JSON ───────────────────────────────────

  async procesarItemsCompra(
    items: ItemCompra[],
    compraId: string,
    fecha: string,
    empresaId?: string,
  ): Promise<{ procesados: number; productos: { nombre: string; cantidad: number; stock: number }[] }> {
    const resultado: { nombre: string; cantidad: number; stock: number }[] = [];

    for (const item of items) {
      if (!item.descripcion || item.cantidad <= 0) continue;
      const prod = await this.buscarOCrear(item.descripcion, item.unidad ?? 'UND', empresaId);
      const mov = await this.registrarEntrada({
        productoId: prod.id,
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario,
        compraId,
        fecha,
        descripcion: `Compra — ${item.descripcion}`,
      });
      resultado.push({
        nombre: prod.nombre,
        cantidad: item.cantidad,
        stock: Number(mov.stockResultante),
      });
    }

    return { procesados: resultado.length, productos: resultado };
  }
}
