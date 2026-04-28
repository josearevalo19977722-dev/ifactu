import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsientoContable, LineaAsiento } from './asiento.entity';
import { Dte } from '../dte/entities/dte.entity';
import { Compra } from '../compras/compra.entity';
import { ComprasService } from '../compras/compras.service';

// ── Plan de Cuentas simplificado El Salvador ──────────────────────────────────
const C: Record<string, Pick<LineaAsiento, 'cuenta' | 'nombreCuenta'>> = {
  CAJA:             { cuenta: '1101', nombreCuenta: 'Caja General' },
  CXC_CF:           { cuenta: '1201', nombreCuenta: 'Clientes - Consumidores Finales' },
  CXC_CCF:          { cuenta: '1202', nombreCuenta: 'Clientes - Contribuyentes' },
  CXC_EXT:          { cuenta: '1203', nombreCuenta: 'Clientes - Exportaciones' },
  CXC_FSE:          { cuenta: '1204', nombreCuenta: 'Clientes - Sujetos Excluidos' },
  IVA_CF:           { cuenta: '1103', nombreCuenta: 'IVA Crédito Fiscal' },
  CXP:              { cuenta: '2101', nombreCuenta: 'Proveedores por Pagar' },
  IVA_DF:           { cuenta: '2102', nombreCuenta: 'IVA Débito Fiscal' },
  VENTAS_CF:        { cuenta: '4101', nombreCuenta: 'Ventas CF - Gravadas' },
  VENTAS_CCF:       { cuenta: '4102', nombreCuenta: 'Ventas CCF - Gravadas' },
  VENTAS_EXENTAS:   { cuenta: '4103', nombreCuenta: 'Ventas Exentas' },
  VENTAS_EXPORT:    { cuenta: '4104', nombreCuenta: 'Ventas de Exportación' },
  VENTAS_FSE:       { cuenta: '4105', nombreCuenta: 'Ventas Sujetos Excluidos' },
  COMPRAS:          { cuenta: '6101', nombreCuenta: 'Compras y Gastos Gravados' },
  COMPRAS_EXENTAS:  { cuenta: '6102', nombreCuenta: 'Compras y Gastos Exentos' },
};

function n(v: any): number { return Math.round((Number(v) || 0) * 100) / 100; }

function resumenDte(dte: Dte) {
  const r = (dte.jsonDte as any)?.resumen ?? {};
  return {
    totalExenta:  n(r.totalExenta  ?? r.totalCompraExenta   ?? 0),
    totalNoSuj:   n(r.totalNoSuj   ?? r.totalCompraNoSujeta ?? 0),
    totalGravada: n(r.totalGravada ?? r.totalCompraAfecta   ?? r.subTotalVentas ?? 0),
    totalIva:     n(r.totalIva     ?? r.ivaPerci1           ?? 0),
    totalPagar:   n(r.totalPagar   ?? dte.totalPagar        ?? 0),
  };
}

function filtrarLineas(lineas: LineaAsiento[]): LineaAsiento[] {
  return lineas.filter(l => l.debe > 0 || l.haber > 0);
}

function totales(lineas: LineaAsiento[]) {
  return {
    totalDebe:  n(lineas.reduce((s, l) => s + l.debe, 0)),
    totalHaber: n(lineas.reduce((s, l) => s + l.haber, 0)),
  };
}

@Injectable()
export class ContabilidadService {
  constructor(
    @InjectRepository(AsientoContable)
    private readonly asientoRepo: Repository<AsientoContable>,
    @InjectRepository(Dte)
    private readonly dteRepo: Repository<Dte>,
    private readonly comprasService: ComprasService,
  ) {}

  // ── Genera asiento desde un DTE ───────────────────────────────────────────

  generarAsientoDte(dte: Dte): Partial<AsientoContable> {
    const r      = resumenDte(dte);
    const rec    = (dte.jsonDte as any)?.receptor
                ?? (dte.jsonDte as any)?.sujetoExcluido
                ?? (dte.jsonDte as any)?.donatario
                ?? {};
    const nombre = rec.nombre ?? dte.receptorNombre ?? 'Sin nombre';

    let lineas:      LineaAsiento[] = [];
    let descripcion: string         = '';

    switch (dte.tipoDte) {
      case '01': { // Factura Consumidor Final
        descripcion = `CF ${dte.numeroControl} — ${nombre}`;
        lineas = filtrarLineas([
          { ...C.CXC_CF,         debe: r.totalPagar,   haber: 0 },
          { ...C.VENTAS_CF,      debe: 0, haber: r.totalGravada },
          { ...C.VENTAS_EXENTAS, debe: 0, haber: r.totalExenta  },
          { ...C.IVA_DF,         debe: 0, haber: r.totalIva     },
        ]);
        break;
      }
      case '03': { // Crédito Fiscal
        descripcion = `CCF ${dte.numeroControl} — ${nombre}`;
        lineas = filtrarLineas([
          { ...C.CXC_CCF,        debe: r.totalPagar,   haber: 0 },
          { ...C.VENTAS_CCF,     debe: 0, haber: r.totalGravada },
          { ...C.VENTAS_EXENTAS, debe: 0, haber: r.totalExenta  },
          { ...C.IVA_DF,         debe: 0, haber: r.totalIva     },
        ]);
        break;
      }
      case '05': { // Nota de Crédito (reversal)
        descripcion = `NC ${dte.numeroControl} — ${nombre}`;
        lineas = filtrarLineas([
          { ...C.VENTAS_CCF,     debe: r.totalGravada, haber: 0 },
          { ...C.VENTAS_EXENTAS, debe: r.totalExenta,  haber: 0 },
          { ...C.IVA_DF,         debe: r.totalIva,     haber: 0 },
          { ...C.CXC_CCF,        debe: 0, haber: r.totalPagar   },
        ]);
        break;
      }
      case '06': { // Nota de Débito
        descripcion = `ND ${dte.numeroControl} — ${nombre}`;
        lineas = filtrarLineas([
          { ...C.CXC_CCF,        debe: r.totalPagar,   haber: 0 },
          { ...C.VENTAS_CCF,     debe: 0, haber: r.totalGravada },
          { ...C.IVA_DF,         debe: 0, haber: r.totalIva     },
        ]);
        break;
      }
      case '11': { // Factura de Exportación (exenta de IVA)
        descripcion = `FEXE ${dte.numeroControl} — ${nombre}`;
        lineas = filtrarLineas([
          { ...C.CXC_EXT,        debe: r.totalPagar,   haber: 0 },
          { ...C.VENTAS_EXPORT,  debe: 0, haber: r.totalPagar   },
        ]);
        break;
      }
      case '14': { // Factura Sujeto Excluido
        descripcion = `FSE ${dte.numeroControl} — ${nombre}`;
        lineas = filtrarLineas([
          { ...C.CXC_FSE,        debe: r.totalPagar,   haber: 0 },
          { ...C.VENTAS_FSE,     debe: 0, haber: r.totalPagar   },
        ]);
        break;
      }
      default: {
        descripcion = `DTE ${dte.tipoDte} ${dte.numeroControl} — ${nombre}`;
        lineas = filtrarLineas([
          { ...C.CAJA,           debe: r.totalPagar,   haber: 0 },
          { ...C.VENTAS_CF,      debe: 0, haber: r.totalGravada },
          { ...C.VENTAS_EXENTAS, debe: 0, haber: r.totalExenta  },
          { ...C.IVA_DF,         debe: 0, haber: r.totalIva     },
        ]);
      }
    }

    return {
      fecha:        dte.fechaEmision,
      descripcion,
      tipo:         'DTE_VENTA',
      referenciaId: dte.id,
      lineas,
      ...totales(lineas),
      empresa: dte.empresa,
    };
  }

  // ── Genera asiento desde una Compra ──────────────────────────────────────

  generarAsientoCompra(compra: Compra): Partial<AsientoContable> {
    const gravada = n(Number(compra.compraGravada));
    const exenta  = n(Number(compra.compraExenta) + Number(compra.compraNoSujeta));
    const iva     = n(Number(compra.ivaCredito));
    const total   = n(Number(compra.totalCompra));

    const lineas: LineaAsiento[] = filtrarLineas([
      { ...C.COMPRAS,         debe: gravada, haber: 0 },
      { ...C.COMPRAS_EXENTAS, debe: exenta,  haber: 0 },
      { ...C.IVA_CF,          debe: iva,     haber: 0 },
      { ...C.CXP,             debe: 0,       haber: total },
    ]);

    return {
      fecha:        compra.fechaEmision,
      descripcion:  `Compra ${compra.tipoDte} — ${compra.proveedorNombre}${compra.numeroControl ? ' | ' + compra.numeroControl : ''}`,
      tipo:         'COMPRA',
      referenciaId: compra.id,
      lineas,
      ...totales(lineas),
    };
  }

  // ── Generación por lote (un mes completo) ─────────────────────────────────

  async generarLote(mes: number, anio: number): Promise<{ generados: number; omitidos: number }> {
    const desde  = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const ultimo = new Date(anio, mes, 0).getDate();
    const hasta  = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;

    const [dtes, compras, existentes] = await Promise.all([
      this.dteRepo.createQueryBuilder('d')
        .where('d.fechaEmision >= :desde', { desde })
        .andWhere('d.fechaEmision <= :hasta', { hasta })
        .andWhere("d.estado NOT IN ('ANULADO','RECHAZADO','PENDIENTE')")
        .leftJoinAndSelect('d.empresa', 'empresa')
        .getMany(),
      this.comprasService.getComprasMes(mes, anio),
      this.asientoRepo.createQueryBuilder('a')
        .where('a.fecha >= :desde', { desde })
        .andWhere('a.fecha <= :hasta', { hasta })
        .select('a.referenciaId')
        .getMany(),
    ]);

    const idsExistentes = new Set<string>(
      existentes.map(a => a.referenciaId).filter(Boolean) as string[],
    );

    let generados = 0;
    let omitidos  = 0;

    for (const dte of dtes) {
      if (idsExistentes.has(dte.id)) { omitidos++; continue; }
      await this.asientoRepo.save(this.asientoRepo.create(this.generarAsientoDte(dte)));
      generados++;
    }

    for (const compra of compras) {
      if (idsExistentes.has(compra.id)) { omitidos++; continue; }
      await this.asientoRepo.save(this.asientoRepo.create(this.generarAsientoCompra(compra)));
      generados++;
    }

    return { generados, omitidos };
  }

  // ── Listar asientos del mes ───────────────────────────────────────────────

  async listar(params: { mes: number; anio: number; page?: number; limit?: number }) {
    const { mes, anio, page = 1, limit = 50 } = params;
    const desde  = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const ultimo = new Date(anio, mes, 0).getDate();
    const hasta  = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;

    return this.asientoRepo.createQueryBuilder('a')
      .where('a.fecha >= :desde', { desde })
      .andWhere('a.fecha <= :hasta', { hasta })
      .orderBy('a.fecha', 'ASC')
      .addOrderBy('a.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  // ── Resumen / Libro Mayor del mes ─────────────────────────────────────────

  async resumenMes(mes: number, anio: number) {
    const desde  = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const ultimo = new Date(anio, mes, 0).getDate();
    const hasta  = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;

    const asientos = await this.asientoRepo.createQueryBuilder('a')
      .where('a.fecha >= :desde', { desde })
      .andWhere('a.fecha <= :hasta', { hasta })
      .getMany();

    const globalDebe  = n(asientos.reduce((s, a) => s + Number(a.totalDebe),  0));
    const globalHaber = n(asientos.reduce((s, a) => s + Number(a.totalHaber), 0));

    // Libro Mayor — acumular por cuenta
    const porCuenta: Record<string, { nombre: string; debe: number; haber: number }> = {};
    for (const a of asientos) {
      for (const l of (a.lineas as LineaAsiento[])) {
        if (!porCuenta[l.cuenta]) {
          porCuenta[l.cuenta] = { nombre: l.nombreCuenta, debe: 0, haber: 0 };
        }
        porCuenta[l.cuenta].debe  += l.debe;
        porCuenta[l.cuenta].haber += l.haber;
      }
    }

    const libroDiario = Object.entries(porCuenta)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([codigo, d]) => ({
        codigo,
        nombre:  d.nombre,
        debe:    n(d.debe),
        haber:   n(d.haber),
        saldo:   n(d.debe - d.haber),
      }));

    return {
      mes, anio,
      cantidad:    asientos.length,
      totalDebe:   globalDebe,
      totalHaber:  globalHaber,
      libroDiario,
    };
  }
}
