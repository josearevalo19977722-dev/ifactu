import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Catálogo de planes disponibles para comprar la extensión iFactu_Conta.
 * Similar a PlanConfig del módulo billing, pero específico para la extensión.
 *
 * Planes estándar:
 *   monthly     — mensual recurrente
 *   annual      — anual prepago
 *   lifetime_1  — vitalicio 1 equipo
 *   lifetime_2  — vitalicio 2 equipos
 *   lifetime_5  — vitalicio 5 equipos
 */
@Entity('extension_plan_config')
export class ExtensionPlanConfig {
  /** Slug del plan (PK) */
  @PrimaryColumn({ type: 'varchar', length: 50 })
  tipo: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  /** Precio en USD */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio: number;

  /** Límite mensual de DTEs (0 = ilimitado) */
  @Column({ type: 'int', default: 500 })
  maxDtesMes: number;

  /** Máximo de dispositivos simultáneos */
  @Column({ type: 'int', default: 1 })
  maxDispositivos: number;

  /** N1CO plan ID (null = requiere configuración antes de vender) */
  @Column({ type: 'int', nullable: true })
  n1coPlanId: number | null;

  /** URL directa del link de pago N1CO */
  @Column({ type: 'varchar', length: 500, nullable: true })
  paymentLinkUrl: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
