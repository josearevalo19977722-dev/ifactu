import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CAT020_CODIGOS_PAISES } from '../../catalogs/paises-cat020';

/**
 * DTO para Factura de Exportación (tipo 11 - FEXE)
 * El receptor es siempre una entidad extranjera (no requiere NIT/NRC).
 * Las ventas son exentas de IVA (exportación = 0% IVA).
 */

export class ItemFexeDto {
  @IsNumber()
  numItem: number;

  @IsNumber()
  tipoItem: number;

  @IsNumber()
  @Min(0)
  cantidad: number;

  @IsOptional()
  @IsString()
  codigo?: string;

  @IsNumber()
  uniMedida: number;

  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsNumber()
  @Min(0)
  precioUni: number;

  @IsNumber()
  @Min(0)
  montoDescu: number;

  @IsNumber()
  ventaGravada: number;
}

export class ReceptorFexeDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  /** Código del país destino (CAT-020, ISO 3166-1 alpha-2) */
  @IsString()
  @IsNotEmpty()
  @IsIn([...CAT020_CODIGOS_PAISES])
  codPais: string;

  /** Nombre del país destino */
  @IsString()
  @IsNotEmpty()
  nombrePais: string;

  /** Complemento de dirección en el país destino */
  @IsOptional()
  @IsString()
  complemento?: string;

  @IsOptional()
  @IsString()
  correo?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  /** NIT o identificador fiscal del país de destino (opcional) */
  @IsOptional()
  @IsString()
  numDocumento?: string;

  /** Tipo doc: 01=Pasaporte, 02=ID extranjero, 36=NIT */
  @IsOptional()
  @IsString()
  tipoDocumento?: string;
}

export class CreateFexeDto {
  @ValidateNested()
  @Type(() => ReceptorFexeDto)
  receptor: ReceptorFexeDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFexeDto)
  items: ItemFexeDto[];

  @IsNumber()
  condicionOperacion: number;

  /** Tipo de exportación: 1=Bienes, 2=Servicios, 3=Ambos */
  @IsNumber()
  tipoExportacion: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
