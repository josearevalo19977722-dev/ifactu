import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Historial de pagos de la extensión iFactu_Conta recibidos vía webhook N1CO.
 * También funciona como registro de idempotencia: un orderCode solo se procesa una vez.
 */
@Entity('extension_pagos')
export class ExtensionPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Licencia creada/renovada con este pago */
  @Column({ type: 'uuid', nullable: true })
  licenseId: string | null;

  /** Código de orden N1CO — único, evita procesar el mismo pago dos veces */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200 })
  orderCode: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  planTipo: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monto: number | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  nombre: string | null;

  /** Payload crudo del webhook, para auditoría/debug */
  @Column({ type: 'jsonb', nullable: true })
  payload: any;

  @CreateDateColumn()
  createdAt: Date;
}
