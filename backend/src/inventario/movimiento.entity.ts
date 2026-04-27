import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Producto } from './producto.entity';

export enum TipoMovimiento {
  ENTRADA = 'ENTRADA',   // Compra / recepción
  SALIDA  = 'SALIDA',    // Venta / emisión DTE
  AJUSTE  = 'AJUSTE',    // Corrección manual
}

@Entity('movimientos_inventario')
export class MovimientoInventario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Producto, p => p.movimientos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productoId' })
  producto: Producto;

  @Column()
  productoId: string;

  @Column({ type: 'enum', enum: TipoMovimiento })
  tipo: TipoMovimiento;

  /** Positivo siempre — el tipo define si suma o resta */
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  cantidad: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  costoUnitario: number;

  /** cantidad × costoUnitario */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total: number;

  /** Stock resultante tras el movimiento */
  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  stockResultante: number;

  /** Referencia a la compra que originó el movimiento (si aplica) */
  @Column({ nullable: true, type: 'uuid' })
  compraId: string | null;

  /** Referencia al DTE que originó el movimiento (si aplica) */
  @Column({ nullable: true, type: 'uuid' })
  dteId: string | null;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ nullable: true, type: 'varchar' })
  descripcion: string | null;

  @CreateDateColumn() createdAt: Date;
}
