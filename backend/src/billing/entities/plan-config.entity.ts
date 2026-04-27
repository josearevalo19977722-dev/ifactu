import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('plan_config')
export class PlanConfig {
  /** Clave del plan — actúa como PK. Estándar: BASICA | PROFESIONAL | EMPRESA. Personalizados: cualquier slug. */
  @PrimaryColumn({ type: 'varchar', length: 50 })
  tipo: string;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precioMensual: number;

  @Column({ type: 'int' })
  limiteDtesMensuales: number;

  @Column({ type: 'int' })
  limiteUsuarios: number;

  /** N1CO plan ID (para pagos recurrentes). Puede ser null en planes de prueba/cortesía. */
  @Column({ type: 'int', nullable: true })
  n1coPlanId: number | null;

  /** URL fija del link de pago N1CO para este plan. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  paymentLinkUrl: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /** Si es true, las nuevas empresas reciben este plan automáticamente al registrarse. Solo uno puede ser true. */
  @Column({ type: 'boolean', default: false })
  esPlanInicial: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
