import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('paquetes_extra_dte')
export class PaqueteExtraDte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  empresaId: string;

  /** Cantidad de DTEs comprados en este paquete */
  @Column({ type: 'int' })
  cantidad: number;

  /** DTEs ya consumidos de este paquete */
  @Column({ type: 'int', default: 0 })
  usado: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio: number;

  /** Si true, al activar también incrementa el límite mensual del plan */
  @Column({ type: 'boolean', default: false })
  esPermanente: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /** PENDIENTE | PAGADO | CANCELADO */
  @Column({ type: 'varchar', length: 50, default: 'PENDIENTE' })
  estado: string;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
