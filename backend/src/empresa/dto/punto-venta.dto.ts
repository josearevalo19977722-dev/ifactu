import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePuntoVentaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  /** Código MH punto de venta (ej. P001, P002) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  codPuntoVentaMh: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdatePuntoVentaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  codPuntoVentaMh?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
