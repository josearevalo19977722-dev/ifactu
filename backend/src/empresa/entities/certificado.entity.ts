import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';

export enum TipoCertificado {
  FIRMA_DTE = 'FIRMA_DTE',
  FIRMA_DISPOSITIVO = 'FIRMA_DISPOSITIVO',
  SSL = 'SSL',
}

@Entity('certificados')
export class Certificado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empresa, { eager: true })
  @JoinColumn({ name: 'empresa_id' })
  empresa: Empresa;

  @Column({ name: 'empresa_id' })
  empresaId: string;

  @Column({ type: 'enum', enum: TipoCertificado, default: TipoCertificado.FIRMA_DTE })
  tipo: TipoCertificado;

  @Column({ type: 'varchar', length: 255 })
  nombreOriginal: string;

  @Column({ type: 'varchar', length: 255 })
  nombreArchivo: string;

  @Column({ name: 'fecha_vencimiento', type: 'date', nullable: true })
  fechaVencimiento: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  serial: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  issuer: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'boolean', default: false })
  esPrincipal: boolean;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  get estaVencido(): boolean {
    if (!this.fechaVencimiento) return false;
    return new Date(this.fechaVencimiento) < new Date();
  }

  get diasRestantes(): number | null {
    if (!this.fechaVencimiento) return null;
    const hoy = new Date();
    const vencimiento = new Date(this.fechaVencimiento);
    const diff = vencimiento.getTime() - hoy.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}
