import { Transform, Type } from 'class-transformer';
import { IsArray, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

export class ItemRetencionDto {
  @IsNumber() numItem: number;
  /** Tipo del DTE que origina la retención: 01=CF, 03=CCF, 04=NRE, 11=FEXE, etc. */
  @Matches(/^(01|03|04|05|06|11|14|15)$/, { message: 'tipoDteRelacionado debe ser un tipo de DTE válido' })
  @IsString() tipoDteRelacionado: string;
  /** 1 = IVA retenido, 2 = Renta retenida */
  @IsNumber() tipo: number;
  /**
   * Código categoría de renta (codigoRetencionMH):
   * Solo aplica cuando tipo=2 (Renta). Valores: C00-C12
   */
  @IsOptional() @IsString() codigoRetencionMH?: string;
  @IsString() @IsNotEmpty() descripcion: string;
  /** N° del DTE (codigoGeneracion UUID) que origina la retención */
  @IsOptional() @IsString() numDocumento?: string;
  /** Fecha del DTE relacionado (YYYY-MM-DD). Si se omite se usa la fecha de emisión */
  @IsOptional() @IsString() fechaDocumento?: string;
  /**
   * Tipo del documento relacionado: 1=Físico (no valida en Hacienda), 2=Electrónico (valida codigoGeneracion)
   * Default: 2
   */
  @IsOptional() @IsNumber() tipoDoc?: number;
  @IsNumber() @Min(0) compraNoSujetaIVA: number;
  @IsNumber() @Min(0) compraExentaIVA: number;
  @IsNumber() @Min(0) compraAfectaIVA: number;
  @IsNumber() @Min(0) porcentajeRenta: number;
  @IsNumber() @Min(0) ivaRetenido: number;
  @IsNumber() @Min(0) montoSujetoGrav: number;
  @IsOptional() @IsString() descripcionDocRelacionado?: string;
}

export class ReceptorRetencionDto {
  @Transform(({ value }) => value?.replace(/[-\s]/g, '') ?? value)
  @Matches(/^\d{14}$/, { message: 'NIT debe tener exactamente 14 dígitos' })
  @IsString() @IsNotEmpty() nit: string;

  @Transform(({ value }) => value?.replace(/[-\s]/g, '') ?? value)
  @Matches(/^\d{1,8}$/, { message: 'NRC debe tener entre 1 y 8 dígitos' })
  @IsString() @IsNotEmpty() nrc: string;
  @IsString() @IsNotEmpty() nombre: string;
  @IsString() @IsNotEmpty() codActividad: string;
  @IsString() @IsNotEmpty() descActividad: string;
  @IsString() @IsNotEmpty() direccionDepartamento: string;
  @IsString() @IsNotEmpty() direccionMunicipio: string;
  @IsString() @IsNotEmpty() direccionComplemento: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEmail() correo?: string;
}

export class CreateRetencionDto {
  @ValidateNested() @Type(() => ReceptorRetencionDto) receptor: ReceptorRetencionDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemRetencionDto) items: ItemRetencionDto[];
  /** Mes de retención (1-12) */
  @IsNumber() periodo: number;
  /** Año de retención */
  @IsNumber() anio: number;
  @IsOptional() @IsNumber() condicionOperacion?: number;
  @IsOptional() @IsString() observaciones?: string;
}
