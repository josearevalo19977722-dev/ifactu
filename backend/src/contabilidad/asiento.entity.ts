import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, CreateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/entities/empresa.entity';

export interface LineaAsiento {
  cuenta:       string;
  nombreCuenta: string;
  debe:         number;
  haber:        number;
}

@Entity('asientos_contables')
export class AsientoContable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 255 })
  descripcion: string;

  /** DTE_VENTA | COMPRA | MANUAL */
  @Column({ type: 'varchar', length: 20, default: 'DTE_VENTA' })
  tipo: string;

  /** ID del DTE o Compra origen */
  @Column({ type: 'uuid', nullable: true, name: 'referencia_id' })
  referenciaId: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, name: 'total_debe' })
  totalDebe: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, name: 'total_haber' })
  totalHaber: number;

  @Column({ type: 'jsonb', default: '[]' })
  lineas: LineaAsiento[];

  @ManyToOne(() => Empresa, { nullable: true })
  empresa: Empresa;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
