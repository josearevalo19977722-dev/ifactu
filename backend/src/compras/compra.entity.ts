import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum EstadoCompra {
  REGISTRADA = 'REGISTRADA',
  ANULADA    = 'ANULADA',
}

@Entity('compras')
export class Compra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 01=CF, 03=CCF, 11=FEXE, 14=FSE, otro */
  @Column({ length: 2, default: '03' })
  tipoDte: string;

  @Column({ nullable: true, type: 'varchar' })
  numeroControl: string | null;

  @Column({ nullable: true, type: 'varchar' })
  codigoGeneracion: string | null;

  @Column({ type: 'date' })
  fechaEmision: string;

  /** Proveedor */
  @Column({ nullable: true, type: 'varchar' })
  proveedorNit: string | null;

  @Column({ nullable: true, type: 'varchar' })
  proveedorNrc: string | null;

  @Column()
  proveedorNombre: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  compraExenta: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  compraNoSujeta: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  compraGravada: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  ivaCredito: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalCompra: number;

  @Column({ nullable: true, type: 'varchar' })
  descripcion: string | null;

  /** Ítems del cuerpoDocumento del DTE (cuando viene de importación JSON) */
  @Column({ nullable: true, type: 'jsonb' })
  itemsJson: any[] | null;

  @Column({ type: 'enum', enum: EstadoCompra, default: EstadoCompra.REGISTRADA })
  estado: EstadoCompra;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
