import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { Sucursal } from './sucursal.entity';
import { Suscripcion } from './suscripcion.entity';

@Entity('empresa')
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre_legal' })
  nombreLegal: string;

  @Column({ name: 'nombre_comercial', nullable: true })
  nombreComercial: string;

  @Column()
  nit: string;

  @Column()
  nrc: string;

  @Column({ name: 'cod_actividad' })
  codActividad: string;

  @Column({ name: 'desc_actividad' })
  descActividad: string;

  @Column({ name: 'tipo_establecimiento', default: '01' })
  tipoEstablecimiento: string;

  @Column({ name: 'cod_estable_mh', default: 'M001' })
  codEstableMh: string;

  @Column({ name: 'cod_punto_venta_mh', default: 'P001' })
  codPuntoVentaMh: string;

  @Column()
  departamento: string;

  @Column()
  municipio: string;

  @Column()
  complemento: string;

  @Column()
  telefono: string;

  @Column()
  correo: string;

  @Column({ name: 'logo_path', nullable: true })
  logoPath: string;

  @Column({ name: 'es_agente_retencion', default: false })
  esAgenteRetencion: boolean;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'pago_al_dia', default: true })
  pagoAlDia: boolean;

  // ── Credenciales Hacienda (SaaS) ──────────────────────────────────────────
  @Column({ name: 'mh_api_key', nullable: true, type: 'text' })
  mhApiKey: string | null;

  @Column({ name: 'mh_password_cert', nullable: true, type: 'text' })
  mhPasswordCert: string | null;

  @Column({ name: 'mh_ambiente', default: '00' }) // '00' = Pruebas, '01' = Producción
  mhAmbiente: string;

  @Column({ name: 'mh_certificado_path', nullable: true, type: 'text' })
  mhCertificadoPath: string | null;

  @Index()
  @Column({ name: 'internal_api_key', nullable: true, type: 'text', unique: true })
  internalApiKey: string | null;

  @OneToMany(() => Sucursal, (sucursal) => sucursal.empresa)
  sucursales: Sucursal[];

  @OneToMany(() => Suscripcion, (suscripcion) => suscripcion.empresa)
  suscripciones: Suscripcion[];

  /** Códigos MH (01, 03, …) que la empresa puede emitir; null o [] = sin restricción (todos) */
  @Column({ name: 'tipos_dte_habilitados', type: 'jsonb', nullable: true })
  tiposDteHabilitados: string[] | null;

  @Column({ name: 'dtes_emitidos_mes', default: 0 })
  dtesEmitidosMes: number;

  @Column({ name: 'ultimo_reset_contador', type: 'date', nullable: true })
  ultimoResetContador: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
