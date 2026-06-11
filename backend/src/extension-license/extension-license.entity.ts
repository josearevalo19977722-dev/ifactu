import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('extension_licenses')
export class ExtensionLicense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  apiKey: string;

  @Column({ type: 'varchar', default: 'ifactu' })
  origen: 'ifactu' | 'n1co';

  @Column({ default: true })
  activa: boolean;

  /** Tipo de plan: basico | pro | ilimitado | ifactu (+ legacy: free/monthly/annual/lifetime_*) */
  @Column({ type: 'varchar', default: 'free' })
  plan: string;

  /**
   * Add-on "Actualizaciones de por vida" ($5 pago único).
   * Pegado a la licencia, no al plan: sobrevive a upgrades de plan.
   * El plan ilimitado lo incluye sin costo.
   */
  @Column({ type: 'boolean', default: false })
  updatesLifetime: boolean;

  /** Límite de DTEs que puede procesar por mes (0 = ilimitado) */
  @Column({ type: 'int', default: 200 })
  maxDtesMes: number;

  /** Contador de DTEs procesados en el mes actual */
  @Column({ type: 'int', default: 0 })
  dtesUsadosMes: number;

  /** Fecha del último reset mensual (para saber cuándo reiniciar el contador) */
  @Column({ type: 'timestamptz', nullable: true })
  dtesResetAt: Date | null;

  /** Fecha de expiración de la licencia (null = no vence) */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  nombre: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  /** ID del usuario iFactu (solo para origen=ifactu) */
  @Column({ type: 'varchar', nullable: true })
  usuarioId: string | null;

  /** Código de orden N1CO para trazabilidad del pago */
  @Column({ type: 'varchar', nullable: true })
  n1coOrderCode: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
