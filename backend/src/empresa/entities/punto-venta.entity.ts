import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Sucursal } from './sucursal.entity';

@Entity('puntos_venta')
export class PuntoVenta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombre: string;

  // Código MH: Punto de Venta (ej: 'P001', 'P002'; el MH admite hasta 15 en JSON DTE)
  @Column({ length: 15 })
  codPuntoVentaMh: string;

  @ManyToOne(() => Sucursal, (sucursal) => sucursal.puntosVenta, { onDelete: 'CASCADE' })
  sucursal: Sucursal;

  @Column()
  sucursalId: string;

  @Column({ default: true })
  activo: boolean;
}
