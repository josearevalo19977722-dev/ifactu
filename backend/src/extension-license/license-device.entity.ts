import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('license_devices')
@Index(['licenseId', 'fingerprint'], { unique: true })
export class LicenseDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  licenseId: string;

  /** SHA-256 del runtime ID + user agent (primeros 32 chars) */
  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  /** "Chrome 124.0.0.0 — Win32" */
  @Column({ type: 'varchar', length: 200, nullable: true })
  nombreDispositivo: string | null;

  @CreateDateColumn()
  activadoAt: Date;

  @UpdateDateColumn()
  lastSeen: Date;
}
