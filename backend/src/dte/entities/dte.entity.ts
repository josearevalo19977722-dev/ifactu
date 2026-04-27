import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';
import { Sucursal } from '../../empresa/entities/sucursal.entity';
import { PuntoVenta } from '../../empresa/entities/punto-venta.entity';

export enum EstadoDte {
  PENDIENTE = 'PENDIENTE',
  RECIBIDO = 'RECIBIDO',
  RECHAZADO = 'RECHAZADO',
  CONTINGENCIA = 'CONTINGENCIA',
  ANULADO = 'ANULADO',
}

@Entity('dtes')
export class Dte {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // '01' = CF, '03' = CCF
  @Column({ length: 2 })
  tipoDte: string;

  @Column({ unique: true })
  numeroControl: string;

  @Column({ unique: true })
  codigoGeneracion: string;

  @Column({ type: 'jsonb' })
  jsonDte: object;

  @Column({ nullable: true, type: 'text' })
  firmado: string;

  @Column({
    type: 'enum',
    enum: EstadoDte,
    default: EstadoDte.PENDIENTE,
  })
  estado: EstadoDte;

  // Sello de recepcion devuelto por el MH (base64 ~512+ chars)
  @Column({ nullable: true, type: 'text' })
  selloRecepcion: string | null;

  // Descripcion del rechazo si aplica
  @Column({ nullable: true, type: 'text' })
  observaciones: string | null;

  // Codigo de clasificacion del mensaje MH (10=Exito, 20=Error)
  @Column({ nullable: true, type: 'varchar', length: 5 })
  clasificaMsg: string | null;

  // Codigo de mensaje MH (001=RECIBIDO, 002=RECIBIDO CON OBSERVACIONES, etc.)
  @Column({ nullable: true, type: 'varchar', length: 10 })
  codigoMsg: string | null;

  // Descripcion del mensaje MH
  @Column({ nullable: true, type: 'varchar', length: 255 })
  descripcionMsg: string | null;

  // Fecha-hora de procesamiento devuelta por el MH (dd/MM/yyyy HH:mm:ss)
  @Column({ name: 'fh_procesamiento', nullable: true, type: 'varchar', length: 30 })
  fhProcesamiento: string | null;

  @Column({ type: 'date' })
  fechaEmision: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPagar: number;

  // Nombre del receptor (para busquedas rapidas)
  @Column({ nullable: true, type: 'varchar' })
  receptorNombre: string | null;

  @ManyToOne(() => Empresa)
  empresa: Empresa;

  @ManyToOne(() => Sucursal, { nullable: true })
  sucursal: Sucursal;

  @ManyToOne(() => PuntoVenta, { nullable: true })
  puntoVenta: PuntoVenta;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
