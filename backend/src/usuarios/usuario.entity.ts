import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { Empresa } from '../empresa/entities/empresa.entity';

export enum RolUsuario {
  ADMIN      = 'ADMIN',
  CONTADOR   = 'CONTADOR',
  EMISOR     = 'EMISOR',
  SUPERADMIN = 'SUPERADMIN',
}

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  nombre: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'enum', enum: RolUsuario, default: RolUsuario.EMISOR })
  rol: RolUsuario;

  @Column({ default: true })
  activo: boolean;

  @ManyToOne(() => Empresa, { nullable: true })
  empresa: Empresa;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
