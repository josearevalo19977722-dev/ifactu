import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

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

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  nombre: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  /** ID del usuario iFactu (solo para origen=ifactu) */
  @Column({ type: 'varchar', nullable: true })
  usuarioId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
