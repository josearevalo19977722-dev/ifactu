import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, Unique } from 'typeorm';
import { Empresa } from './empresa.entity';
import { PuntoVenta } from './punto-venta.entity';

@Unique(['empresaId', 'codEstableMh'])
@Entity('sucursales')
export class Sucursal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombre: string;

  @Column()
  direccion: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  telefono: string | null;

  // Código MH: Establecimiento (ej: '0001', '0002')
  @Column({ length: 4 })
  codEstableMh: string;

  @ManyToOne(() => Empresa, (empresa) => empresa.sucursales, { onDelete: 'CASCADE' })
  empresa: Empresa;

  @Column()
  empresaId: string;

  @OneToMany(() => PuntoVenta, (pv) => pv.sucursal)
  puntosVenta: PuntoVenta[];
}
