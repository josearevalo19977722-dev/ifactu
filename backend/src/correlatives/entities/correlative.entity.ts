import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Unique,
  ManyToOne,
} from 'typeorm';
import { Empresa } from '../../empresa/entities/empresa.entity';

@Entity('correlatives')
@Unique(['tipoDte', 'ambiente', 'sucursal', 'pos', 'empresa', 'anio'])
export class Correlative {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 2 })
  tipoDte: string;

  @Column({ length: 2, default: '00' })
  ambiente: string;

  @Column({ length: 10, default: 'M001' })
  sucursal: string;

  @Column({ length: 10, default: 'P001' })
  pos: string;

  @Column({ type: 'int', default: 2024 })
  anio: number;

  // bigint soporta hasta 9,223,372,036,854,775,807 — sin riesgo de overflow con 15 dígitos (max 999,999,999,999,999)
  // PostgreSQL int (int4) solo llega a 2,147,483,647 (~2.1B), insuficiente para numeración de 15 dígitos.
  @Column({ type: 'bigint', default: 0 })
  ultimoNumero: number;

  @ManyToOne(() => Empresa)
  empresa: Empresa;

  @UpdateDateColumn()
  updatedAt: Date;
}
