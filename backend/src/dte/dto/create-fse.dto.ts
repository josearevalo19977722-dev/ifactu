import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class ItemFseDto {
  @IsNumber() numItem: number;
  @IsNumber() tipoItem: number;
  @IsNumber() @Min(0) cantidad: number;
  @IsOptional() @IsString() codigo?: string;
  @IsNumber() uniMedida: number;
  @IsString() @IsNotEmpty() descripcion: string;
  @IsNumber() @Min(0) precioUni: number;
  @IsNumber() @Min(0) montoDescu: number;
  @IsOptional() @IsNumber() compraNoSujeta?: number;
  @IsOptional() @IsNumber() compraExenta?: number;
  @IsOptional() @IsNumber() compraAfectada?: number;
  @IsOptional() @IsNumber() compra?: number;
}

export class ReceptorFseDto {
  /** 13=DUI, 36=NIT, 02=Pasaporte, 03=Carné residente, 37=Otro */
  @IsIn(['02', '03', '13', '36', '37'], { message: 'tipoDocumento debe ser 02, 03, 13, 36 o 37' })
  @IsString() @IsNotEmpty() tipoDocumento: string;

  @MaxLength(20)
  @IsString() @IsNotEmpty() numDocumento: string;
  @IsString() @IsNotEmpty() nombre: string;
  @IsOptional() @IsString() codActividad?: string;
  @IsOptional() @IsString() descActividad?: string;
  @IsString() @IsNotEmpty() direccionDepartamento: string;
  @IsString() @IsNotEmpty() direccionMunicipio: string;
  @IsString() @IsNotEmpty() direccionComplemento: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEmail() correo?: string;
}

export class CreateFseDto {
  @ValidateNested() @Type(() => ReceptorFseDto) receptor: ReceptorFseDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemFseDto) items: ItemFseDto[];
  @IsNumber() condicionOperacion: number;
  @IsOptional() @IsNumber() @Min(0) reteRenta?: number;
  @IsOptional() @IsString() observaciones?: string;

  /** Código de sucursal (Establecimiento de Hacienda) */
  @IsOptional() @IsString() @MaxLength(4) codEstable?: string;

  /** Código de punto de venta */
  @IsOptional() @IsString() @MaxLength(15) codPuntoVenta?: string;
}
