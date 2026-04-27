import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { MovimientoInventario } from './movimiento.entity';

@Entity('productos')
export class Producto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Código interno o SKU — puede venir del DTE o asignarse manualmente */
  @Column({ nullable: true, unique: true, type: 'varchar' })
  codigo: string | null;

  @Column()
  nombre: string;

  @Column({ nullable: true, type: 'varchar' })
  descripcion: string | null;

  @Column({ length: 20, default: 'UND' })
  unidad: string;

  /** Stock en unidades — se actualiza con cada movimiento */
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  stockActual: number;

  /** Costo promedio ponderado — se recalcula en cada ENTRADA */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  costoUnitario: number;

  /** Precio de venta sugerido */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  precioVenta: number | null;

  @Column({ default: true })
  activo: boolean;

  /** Código de unidad de medida según catálogo del MH (e.g. 59 para Unidad) */
  @Column({ type: 'int', default: 59 })
  uniMedidaMh: number;

  /** Tipo de ítem para DTE (1: Bien, 2: Servicio, 3: Ambos) */
  @Column({ type: 'int', default: 1 })
  tipoItem: number;

  @OneToMany(() => MovimientoInventario, m => m.producto)
  movimientos: MovimientoInventario[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
