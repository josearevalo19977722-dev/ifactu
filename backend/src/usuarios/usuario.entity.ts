import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, ManyToMany, JoinTable } from 'typeorm';
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

  /** Empresa principal (ADMIN / EMISOR) */
  @ManyToOne(() => Empresa, { nullable: true })
  empresa: Empresa;

  /** Empresas adicionales (CONTADOR puede acceder a varias) */
  @ManyToMany(() => Empresa, { eager: false, nullable: true })
  @JoinTable({
    name: 'usuario_empresas',
    joinColumn:        { name: 'usuarioId',  referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'empresaId',  referencedColumnName: 'id' },
  })
  empresas: Empresa[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
