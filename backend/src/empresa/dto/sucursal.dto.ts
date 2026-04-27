import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSucursalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  direccion: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  /** Código establecimiento MH (ej. M001, 0001) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  codEstableMh: string;
}

export class UpdateSucursalDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  codEstableMh?: string;
}
