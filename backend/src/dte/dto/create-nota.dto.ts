import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * DTO compartido para Nota de Crédito (05) y Nota de Débito (06).
 * Ambas deben referenciar un CCF (tipo 03) existente y aprobado por el MH.
 */
export class ItemNotaDto {
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
  @MaxLength(1000)
  descripcion: string;

  @IsNumber()
  @Min(0)
  precioUni: number;

  @IsNumber()
  @Min(0)
  montoDescu: number;

  @IsNumber()
  ventaNoSuj: number;

  @IsNumber()
  ventaExenta: number;

  @IsNumber()
  ventaGravada: number;
}

export class CreateNotaDto {
  /** ID interno del DTE (CCF) que se está corrigiendo/cargando */
  @IsString()
  @IsNotEmpty()
  dteReferenciadoId: string;

  /**
   * Razón del ajuste:
   * NC: 1=Descuento, 2=Anulación parcial, 3=Devol. mercancía, 4=Descuento condic., 5=Corrección, 6=Otro
   * ND: 1=Cargo adicional, 2=Diferencia precio, 3=Otro
   */
  @IsNumber()
  tipoAjuste: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivoAjuste: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemNotaDto)
  items: ItemNotaDto[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  observaciones?: string;
}
