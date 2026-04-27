import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne,
} from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';

export enum EstadoPago {
  PENDIENTE  = 'PENDIENTE',
  PAGADO     = 'PAGADO',
  FALLIDO    = 'FALLIDO',
  CANCELADO  = 'CANCELADO',
}

@Entity('pagos_n1co')
export class PagoN1co {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empresa, { nullable: false })
  empresa: Empresa;

  /** Tipo/slug del plan que se está pagando */
  @Column({ type: 'varchar', length: 50 })
  planTipo: string;

  /** planId devuelto por N1CO al crear el plan */
  @Column({ name: 'n1co_plan_id', type: 'int', nullable: true })
  n1coPlanId: number | null;

  /** orderCode de N1CO para consultar estado */
  @Column({ name: 'order_code', type: 'varchar', nullable: true })
  orderCode: string | null;

  /** URL de pago N1CO para redirigir al usuario */
  @Column({ name: 'payment_link_url', type: 'text', nullable: true })
  paymentLinkUrl: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto: number;

  @Column({ type: 'enum', enum: EstadoPago, default: EstadoPago.PENDIENTE })
  estado: EstadoPago;

  /** Cuántos meses cubre este pago */
  @Column({ name: 'meses', default: 1 })
  meses: number;

  /** Datos raw del webhook de N1CO */
  @Column({ name: 'webhook_data', type: 'jsonb', nullable: true })
  webhookData: any | null;

  /** Tipo de pago: PLAN (suscripción) o EXTRA (paquete de DTEs adicional) */
  @Column({ type: 'varchar', length: 10, default: 'PLAN' })
  tipo: 'PLAN' | 'EXTRA';

  /** UUID de PaqueteExtraDte asociado (solo cuando tipo=EXTRA) */
  @Column({ name: 'paquete_extra_id', type: 'varchar', nullable: true })
  paqueteExtraId: string | null;

  /** Indica si el paquete extra es permanente/recurrente (solo cuando tipo=EXTRA) */
  @Column({ name: 'es_permanente', type: 'boolean', nullable: true })
  esPermanente: boolean | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
