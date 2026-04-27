import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * Opciones de paquetes extra disponibles para que las empresas contraten.
 * El superadmin gestiona este catálogo.
 */
@Entity('paquetes_catalogo')
export class PaqueteCatalogo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Etiqueta visible (ej: "Paquete Básico", "Paquete Inicio") — opcional */
  @Column({ type: 'varchar', length: 120, nullable: true })
  nombre: string | null;

  /** Cantidad de DTEs incluidos */
  @Column({ type: 'int' })
  cantidad: number;

  /** Precio en USD */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio: number;

  /** Orden en que aparece en el modal */
  @Column({ type: 'int', default: 0 })
  orden: number;

  /** Si false, no aparece en el modal de empresa */
  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /** ID del plan N1CO para compra única (1 ciclo de facturación) */
  @Column({ name: 'n1co_plan_id_una_vez', type: 'int', nullable: true })
  n1coPlanIdUnaVez: number | null;

  /** Link de pago N1CO para compra única */
  @Column({ name: 'payment_link_una_vez', type: 'text', nullable: true })
  paymentLinkUnaVez: string | null;

  /** ID del plan N1CO para suscripción mensual recurrente */
  @Column({ name: 'n1co_plan_id_permanente', type: 'int', nullable: true })
  n1coPlanIdPermanente: number | null;

  /** Link de pago N1CO para suscripción mensual recurrente */
  @Column({ name: 'payment_link_permanente', type: 'text', nullable: true })
  paymentLinkPermanente: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
