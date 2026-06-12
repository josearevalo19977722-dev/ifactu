import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * Catálogo de planes disponibles para comprar la extensión iFactu_Conta.
 * Similar a PlanConfig del módulo billing, pero específico para la extensión.
 *
 * Planes vigentes (mensuales):
 *   basico    — 150 DTEs/mes | 1 cuenta correo | sin F-07 | sin Excel
 *   pro       — 500 DTEs/mes | 3 cuentas       | F-07 ✓   | Excel ✓
 *   ilimitado — sin límites  | todo incluido
 *
 * Legacy (desactivados, licencias viejas siguen funcionando):
 *   monthly / annual / lifetime_1 / lifetime_2 / lifetime_5
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

  /** Máximo de cuentas de correo monitoreadas (0 = ilimitado) */
  @Column({ type: 'int', default: 1 })
  maxCuentasCorreo: number;

  /** Incluye generación del anexo F-07 */
  @Column({ type: 'boolean', default: false })
  incluyeF07: boolean;

  /** Incluye exportación a Excel */
  @Column({ type: 'boolean', default: false })
  incluyeExcel: boolean;

  /** N1CO plan ID (null = requiere configuración antes de vender) */
  @Column({ type: 'int', nullable: true })
  n1coPlanId: number | null;

  /** URL directa del link de pago N1CO */
  @Column({ type: 'varchar', length: 500, nullable: true })
  paymentLinkUrl: string | null;

  /** N1CO plan ID de la variante "plan + actualizaciones de por vida" */
  @Column({ type: 'int', nullable: true })
  n1coPlanIdConUpdates: number | null;

  /** Payment link de la variante "plan + actualizaciones de por vida" */
  @Column({ type: 'varchar', length: 500, nullable: true })
  paymentLinkUrlConUpdates: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
