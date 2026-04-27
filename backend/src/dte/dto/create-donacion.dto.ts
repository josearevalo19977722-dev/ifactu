import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ItemDonacionDto {
  @IsNumber() numItem: number;

  /** 1 = Dineraria, 2 = No dineraria (especie) */
  @IsNumber() tipoDonacion: number;

  @IsNumber() @Min(0) cantidad: number;

  @IsOptional() @IsString() codigo?: string;

  @IsNumber() uniMedida: number;

  @IsString() @IsNotEmpty() descripcion: string;

  /** Valor unitario del bien/servicio donado */
  @IsNumber() @Min(0) valorUni: number;

  @IsNumber() @Min(0) montoDescu: number;

  /** Depreciación acumulada (0 si no aplica) */
  @IsNumber() @Min(0) depreciacion: number;

  /** Valor total del ítem = valorUni * cantidad - montoDescu - depreciacion */
  @IsNumber() @Min(0) valor: number;
}

export class DonatarioDto {
  /** 13=DUI, 36=NIT, 02=Pasaporte, 03=Carné residente, 37=Otro */
  @IsString() @IsNotEmpty() tipoDocumento: string;
  @IsString() @IsNotEmpty() numDocumento: string;

  @IsOptional() @IsString() nrc?: string;
  @IsString() @IsNotEmpty() nombre: string;
  @IsOptional() @IsString() nombreComercial?: string;

  @IsOptional() @IsString() codActividad?: string;
  @IsOptional() @IsString() descActividad?: string;

  /** Tipo de establecimiento (ej. "02" = Casa Matriz) */
  @IsString() @IsNotEmpty() tipoEstablecimiento: string;

  @IsString() @IsNotEmpty() direccionDepartamento: string;
  @IsString() @IsNotEmpty() direccionMunicipio: string;
  @IsString() @IsNotEmpty() direccionComplemento: string;

  /** Código establecimiento MH */
  @IsString() @IsNotEmpty() codEstableMH: string;
  /** Código punto de venta MH */
  @IsString() @IsNotEmpty() codPuntoVentaMH: string;

  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsEmail() correo?: string;
}

export class CreateDonacionDto {
  @ValidateNested() @Type(() => DonatarioDto) donatario: DonatarioDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ItemDonacionDto) items: ItemDonacionDto[];
  /**
   * Número de resolución de Hacienda que autoriza al donatario a recibir donaciones deducibles.
   * Requerido por el campo otrosDocumentos del esquema tipo 15.
   */
  @IsOptional() @IsString() numResolucion?: string;
  @IsOptional() @IsString() descripcionResolucion?: string;
  @IsOptional() @IsString() observaciones?: string;
}
