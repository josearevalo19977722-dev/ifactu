import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Compra, EstadoCompra } from './compra.entity';
import { InventarioService, ItemCompra } from '../inventario/inventario.service';

function n(v: any) { return Math.round((Number(v) || 0) * 100) / 100; }

export interface DteParsed {
  compra: Partial<Compra>;
  items: ItemCompra[];
}

/** Extrae campos de un JSON DTE de Hacienda SV y devuelve compra + ítems */
function parsearJsonDte(raw: any): DteParsed {
  if (!raw || typeof raw !== 'object') {
    throw new BadRequestException('JSON inválido');
  }

  // El DTE puede venir como { dteJson: {...} } o directamente el objeto
  const dte = raw.dteJson ?? raw;

  const id    = dte.identificacion ?? {};
  const emis  = dte.emisor ?? {};
  const res   = dte.resumen ?? {};

  const tipoDte = String(id.tipoDte ?? id.codigoTipoDte ?? '03');
  const fechaEmision: string = id.fecEmi ?? id.fechaEmision ?? new Date().toISOString().split('T')[0];
  const numeroControl: string = id.numeroControl ?? '';
  const codigoGeneracion: string = id.codigoGeneracion ?? id.uuid ?? '';

  const proveedorNombre: string = emis.nombre ?? emis.nombreComercial ?? '';
  const proveedorNit: string    = emis.nit ?? emis.numDocumento ?? '';
  const proveedorNrc: string    = emis.nrc ?? '';

  const compraExenta: number  = n(res.totalExenta  ?? res.montoExento  ?? 0);
  const compraNoSujeta: number = n(res.totalNoSuj  ?? res.montoNoSujeto ?? 0);
  const compraGravada: number = n(res.totalGravada ?? res.montoGravado  ?? 0);
  // IVA: CCF almacena IVA en tributos[0].valor, CF en totalIva, otras variantes en ivaPercibido/ivaRetenido
  const ivaCredito: number    = n(res.totalIva ?? res.tributos?.[0]?.valor ?? res.ivaPercibido ?? res.ivaRetenido ?? n(compraGravada * 0.13));
  const totalCompra: number   = n(res.totalPagar ?? res.montoTotalOperacion ?? (compraExenta + compraNoSujeta + compraGravada + ivaCredito));

  if (!proveedorNombre) {
    throw new BadRequestException('No se encontró el nombre del emisor en el JSON');
  }

  // Extraer ítems del cuerpoDocumento
  const items: ItemCompra[] = (dte.cuerpoDocumento ?? [])
    .filter((it: any) => it.descripcion || it.nombre)
    .map((it: any) => {
      const cant   = Number(it.cantidad) || 0;
      const precio = Number(it.precioUni) || 0;
      // Unidad de medida: el código viene como número en el DTE, guardamos como string
      const unidad = it.uniMedida ? String(it.uniMedida) : 'UND';
      return {
        descripcion:   String(it.descripcion ?? it.nombre ?? '').trim(),
        cantidad:      cant,
        costoUnitario: precio,
        unidad,
      } as ItemCompra;
    })
    .filter((it: ItemCompra) => it.descripcion && it.cantidad > 0);

  const compra: Partial<Compra> = {
    tipoDte, fechaEmision, numeroControl, codigoGeneracion,
    proveedorNit, proveedorNrc, proveedorNombre,
    compraExenta, compraNoSujeta, compraGravada, ivaCredito, totalCompra,
    itemsJson: items.length > 0 ? items : null,
  };

  return { compra, items };
}

@Injectable()
export class ComprasService {
  constructor(
    @InjectRepository(Compra) private readonly repo: Repository<Compra>,
    private readonly inventarioSvc: InventarioService,
  ) {}

  /** Parsea un JSON DTE y devuelve la compra + ítems SIN guardar */
  parsearJson(raw: any): DteParsed {
    return parsearJsonDte(raw);
  }

  /** Parsea un JSON DTE, lo guarda y procesa el inventario automáticamente */
  async registrarDesdeJson(
    raw: any,
    optsInventario: { aplicarInventario: boolean; empresaId?: string },
  ): Promise<{ compra: Compra; inventario: Awaited<ReturnType<InventarioService['procesarItemsCompra']>> | null }> {
    const { compra: datos, items } = parsearJsonDte(raw);

    // Evitar duplicados por codigoGeneracion
    if (datos.codigoGeneracion) {
      const existe = await this.repo.findOne({ where: { codigoGeneracion: datos.codigoGeneracion } });
      if (existe) throw new BadRequestException('Este DTE ya fue registrado (codigoGeneracion duplicado)');
    }

    const compra = await this.registrar({ ...datos, empresaId: optsInventario.empresaId ?? null });

    let inventario: Awaited<ReturnType<InventarioService['procesarItemsCompra']>> | null = null;
    if (optsInventario.aplicarInventario && items.length > 0) {
      inventario = await this.inventarioSvc.procesarItemsCompra(
        items,
        compra.id,
        compra.fechaEmision,
        optsInventario.empresaId ?? undefined,
      );
    }

    return { compra, inventario };
  }

  /** Busca una compra por codigoGeneracion (para deduplicación POS) */
  async buscarPorCodigo(codigoGeneracion: string): Promise<Compra | null> {
    return this.repo.findOne({ where: { codigoGeneracion } });
  }

  /** Busca una compra por numeroControl (fallback deduplicación POS) */
  async buscarPorNumeroControl(numeroControl: string): Promise<Compra | null> {
    return this.repo.findOne({ where: { numeroControl } });
  }

  async registrar(dto: Partial<Compra>): Promise<Compra> {
    // Calcular IVA crédito automáticamente si no viene
    if (!dto.ivaCredito && dto.compraGravada) {
      dto.ivaCredito = n(Number(dto.compraGravada) * 0.13);
    }
    if (!dto.totalCompra) {
      dto.totalCompra = n(
        (Number(dto.compraExenta) || 0) +
        (Number(dto.compraNoSujeta) || 0) +
        (Number(dto.compraGravada) || 0) +
        (Number(dto.ivaCredito) || 0)
      );
    }
    return this.repo.save(this.repo.create(dto));
  }

  async listar(params: { mes?: number; anio?: number; q?: string; page?: number; limit?: number; empresaId?: string }) {
    const { mes, anio, q, page = 1, limit = 20, empresaId } = params;
    const qb = this.repo.createQueryBuilder('c');

    if (empresaId) qb.andWhere('"c"."empresaId" = :empresaId', { empresaId });

    if (mes && anio) {
      const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
      const ultimo = new Date(anio, mes, 0).getDate();
      const hasta  = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;
      qb.andWhere('c.fechaEmision >= :desde', { desde })
        .andWhere('c.fechaEmision <= :hasta', { hasta });
    }

    if (q) {
      const term = `%${q.toLowerCase()}%`;
      qb.andWhere(new Brackets(w =>
        w.where('LOWER(c.proveedorNombre) LIKE :term', { term })
          .orWhere('LOWER(c.proveedorNit) LIKE :term', { term })
          .orWhere('LOWER(c.numeroControl) LIKE :term', { term })
      ));
    }

    qb.andWhere("c.estado = 'REGISTRADA'");

    return qb.orderBy('c.fechaEmision', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();
  }

  /**
   * Detecta compras REGISTRADAS cuyo ivaCredito difiere en más de $0.10
   * del 13% esperado sobre la compraGravada.
   *
   * Causas típicas:
   *  - El proveedor emitió el DTE con un IVA incorrecto
   *  - La compra fue registrada manualmente con un valor equivocado
   *  - El DTE fue anulado por el proveedor y corresponde eliminarla / registrar NC
   *
   * Nota: compras 100% exentas/no sujetas (compraGravada = 0) se omiten
   * porque no tienen crédito fiscal y la validación no aplica.
   */
  async getAlertasCompras(mes: number, anio: number, empresaId?: string) {
    const compras = await this.getComprasMes(mes, anio, empresaId);
    return compras
      .filter(c => {
        const base = n(Number(c.compraGravada));
        if (base === 0) return false;          // exenta/noSujeta — no aplica
        const ivaEsperado = n(base * 0.13);
        const ivaReal     = n(Number(c.ivaCredito));
        return Math.abs(ivaEsperado - ivaReal) > 0.10;
      })
      .map(c => {
        const base        = n(Number(c.compraGravada));
        const ivaEsperado = n(base * 0.13);
        const ivaReal     = n(Number(c.ivaCredito));
        return {
          id:               c.id,
          fechaEmision:     c.fechaEmision,
          tipoDte:          c.tipoDte,
          proveedorNombre:  c.proveedorNombre,
          proveedorNit:     c.proveedorNit,
          codigoGeneracion: c.codigoGeneracion,
          compraGravada:    base,
          ivaCredito:       ivaReal,
          ivaEsperado,
          diferencia:       n(Math.abs(ivaEsperado - ivaReal)),
          observaciones:    c.observaciones ?? null,
        };
      });
  }

  async resumenMes(mes: number, anio: number, empresaId?: string) {
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const ultimo = new Date(anio, mes, 0).getDate();
    const hasta  = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;

    const qb = this.repo.createQueryBuilder('c')
      .where('c.fechaEmision >= :desde', { desde })
      .andWhere('c.fechaEmision <= :hasta', { hasta })
      .andWhere("c.estado = 'REGISTRADA'");
    if (empresaId) qb.andWhere('"c"."empresaId" = :empresaId', { empresaId });
    const compras = await qb.getMany();

    // Calcular alertas de IVA (se incluyen en el resumen para el frontend)
    const alertasIva = compras.filter(c => {
      const base = n(Number(c.compraGravada));
      if (base === 0) return false;
      return Math.abs(n(base * 0.13) - n(Number(c.ivaCredito))) > 0.10;
    });

    // NC recibida (tipo 05): el proveedor te devuelve dinero → RESTA el crédito fiscal
    // ND recibida (tipo 06): el proveedor te cobra más → SUMA al crédito (normal)
    // CCF (tipo 03): compra normal → SUMA
    const totales = compras.reduce((acc, c) => {
      const esNC  = c.tipoDte === '05';
      const signo = esNC ? -1 : 1;
      return {
        cantidad:      acc.cantidad + 1,
        compraExenta:  n(acc.compraExenta  + signo * Number(c.compraExenta)),
        compraNoSuj:   n(acc.compraNoSuj   + signo * Number(c.compraNoSujeta)),
        compraGravada: n(acc.compraGravada + signo * Number(c.compraGravada)),
        ivaCredito:    n(acc.ivaCredito    + signo * Number(c.ivaCredito)),
        total:         n(acc.total         + signo * Number(c.totalCompra)),
        // Desglose NC para mostrar en pantalla F-07
        cantidadNC:    acc.cantidadNC + (esNC ? 1 : 0),
        ivaNC:         n(acc.ivaNC    + (esNC ? Number(c.ivaCredito) : 0)),
      };
    }, { cantidad: 0, compraExenta: 0, compraNoSuj: 0, compraGravada: 0,
         ivaCredito: 0, total: 0, cantidadNC: 0, ivaNC: 0 });

    return {
      ...totales,
      // Alertas de consistencia: compras donde ivaCredito ≠ 13% de compraGravada
      // El contador debe revisar estas antes de presentar el F-07
      alertasIva: alertasIva.map(c => ({
        id:              c.id,
        fechaEmision:    c.fechaEmision,
        proveedorNombre: c.proveedorNombre,
        codigoGeneracion: c.codigoGeneracion,
        compraGravada:   n(Number(c.compraGravada)),
        ivaCredito:      n(Number(c.ivaCredito)),
        ivaEsperado:     n(n(Number(c.compraGravada)) * 0.13),
        diferencia:      n(Math.abs(n(Number(c.compraGravada)) * 0.13 - n(Number(c.ivaCredito)))),
        observaciones:   c.observaciones ?? null,
      })),
    };
  }

  async obtener(id: string): Promise<Compra> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Compra no encontrada');
    return c;
  }

  async actualizar(id: string, dto: Partial<Compra>): Promise<Compra> {
    await this.repo.update(id, dto);
    return this.obtener(id);
  }

  async anular(id: string): Promise<Compra> {
    await this.repo.update(id, { estado: EstadoCompra.ANULADA });
    return this.obtener(id);
  }

  /** Devuelve todas las compras REGISTRADAS de un mes/año (para CSV F-07) */
  async getComprasMes(mes: number, anio: number, empresaId?: string): Promise<Compra[]> {
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const ultimo = new Date(anio, mes, 0).getDate();
    const hasta  = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;

    const qb = this.repo.createQueryBuilder('c')
      .where('c.fechaEmision >= :desde', { desde })
      .andWhere('c.fechaEmision <= :hasta', { hasta })
      .andWhere("c.estado = 'REGISTRADA'");
    if (empresaId) qb.andWhere('"c"."empresaId" = :empresaId', { empresaId });
    return qb.orderBy('c.fechaEmision', 'ASC')
      .addOrderBy('c.proveedorNombre', 'ASC')
      .getMany();
  }
}
