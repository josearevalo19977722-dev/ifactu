import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Nota de Remisión (tipo 04 - NRE)
 * Ampara el traslado de bienes sin transferencia de dominio.
 * Debe referenciar un CCF (tipo 03) o una venta a crédito.
 */

export class ItemNreDto {
  @IsNumber()
  numItem: number;

  @IsNumber()
  tipoItem: number;

  @IsNumber()
  @Min(0)
  cantidad: number;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  codigo?: string;

  @IsNumber()
  uniMedida: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  descripcion: string;

  @IsNumber()
  @Min(0)
  precioUni: number;

  @IsNumber()
  @Min(0)
  montoDescu: number;

  @IsNumber()
  @Min(0)
  ventaNoSuj: number;

  @IsNumber()
  @Min(0)
  ventaExenta: number;

  @IsNumber()
  @Min(0)
  ventaGravada: number;
}

export class ReceptorNreDto {
  @Transform(({ value }) => value?.replace(/[-\s]/g, '') ?? value)
  @Matches(/^\d{14}$/, { message: 'NIT debe tener exactamente 14 dígitos' })
  @IsString()
  @IsNotEmpty()
  nit: string;

  @Transform(({ value }) => value?.replace(/[-\s]/g, '') ?? value)
  @Matches(/^\d{1,8}$/, { message: 'NRC debe tener entre 1 y 8 dígitos' })
  @IsString()
  @IsNotEmpty()
  nrc: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  codActividad: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  descActividad: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2)
  direccionDepartamento: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4)
  direccionMunicipio: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccionComplemento: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  correo?: string;
}

export class CreateNreDto {
  /** ID interno del CCF (tipo 03) que origina este traslado (opcional) */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' || value === null) ? undefined : value)
  dteReferenciadoId?: string;

  @ValidateNested()
  @Type(() => ReceptorNreDto)
  receptor: ReceptorNreDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemNreDto)
  items: ItemNreDto[];

  @IsNumber()
  condicionOperacion: number;

  /** Punto de entrega / destino */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  puntoEntrega?: string;

  /** Nombre de quien entrega físicamente los bienes */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombEntrega?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  docuEntrega?: string;

  /** Nombre de quien recibe */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombRecibe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  docuRecibe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  observaciones?: string;
}
