import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';

export enum TipoSuscripcion {
  BASICA = 'BASICA',
  PROFESIONAL = 'PROFESIONAL',
  EMPRESA = 'EMPRESA',
  CUSTOM = 'CUSTOM',
}

export enum EstadoSuscripcion {
  ACTIVA = 'ACTIVA',
  SUSPENDIDA = 'SUSPENDIDA',
  VENCIDA = 'VENCIDA',
  CANCELADA = 'CANCELADA',
}

@Entity('suscripciones')
export class Suscripcion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.suscripciones)
  empresa: Empresa;

  /** Tipo/slug del plan. Puede ser un valor estándar (BASICA, PROFESIONAL, EMPRESA) o un slug personalizado. */
  @Column({ type: 'varchar', length: 50, default: 'BASICA' })
  tipo: string;

  @Column({ type: 'enum', enum: EstadoSuscripcion, default: EstadoSuscripcion.ACTIVA })
  estado: EstadoSuscripcion;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: Date;

  @Column({ name: 'fecha_vencimiento', type: 'date', nullable: true })
  fechaVencimiento: Date | null;

  @Column({ name: 'limite_dtes_mensuales', default: 100 })
  limiteDtesMensuales: number;

  @Column({ name: 'limite_usuarios', default: 5 })
  limiteUsuarios: number;

  @Column({ name: 'limite_sucursales', default: 3 })
  limiteSucursales: number;

  @Column({ name: 'limite_puntos_venta', default: 10 })
  limitePuntosVenta: number;

  @Column({ name: 'permite_exportacion', default: true })
  permiteExportacion: boolean;

  @Column({ name: 'permite_multi_moneda', default: false })
  permiteMultiMoneda: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  precioMensual: number;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
