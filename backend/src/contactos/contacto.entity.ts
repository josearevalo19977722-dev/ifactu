import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TipoContacto {
  CLIENTE    = 'CLIENTE',
  PROVEEDOR  = 'PROVEEDOR',
  AMBOS      = 'AMBOS',
}

@Entity('contactos')
export class Contacto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TipoContacto, default: TipoContacto.CLIENTE })
  tipo: TipoContacto;

  /** 13=DUI, 36=NIT, 37=Otro */
  @Column({ length: 4 })
  tipoDocumento: string;

  @Column()
  numDocumento: string;

  @Column({ nullable: true, type: 'varchar' })
  nit: string | null;

  @Column({ nullable: true, type: 'varchar' })
  nrc: string | null;

  @Column()
  nombre: string;

  @Column({ nullable: true, type: 'varchar' })
  codActividad: string | null;

  @Column({ nullable: true, type: 'varchar' })
  descActividad: string | null;

  @Column({ nullable: true, type: 'varchar' })
  direccionDepartamento: string | null;

  @Column({ nullable: true, type: 'varchar' })
  direccionMunicipio: string | null;

  @Column({ nullable: true, type: 'varchar' })
  direccionComplemento: string | null;

  @Column({ nullable: true, type: 'varchar' })
  telefono: string | null;

  @Column({ nullable: true, type: 'varchar' })
  correo: string | null;

  @Column({ nullable: true, type: 'text' })
  notas: string | null;

  @Column({ default: false })
  esGranContribuyente: boolean;

  @Column({ nullable: true, type: 'varchar', length: 2 })
  codPais: string | null;

  @Column({ nullable: true, type: 'varchar' })
  nombrePais: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
