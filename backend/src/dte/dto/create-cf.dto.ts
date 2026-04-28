import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export enum CondicionOperacion {
  CONTADO = 1,
  CREDITO = 2,
  OTRO = 3,
}

export enum CodigoPago {
  EFECTIVO       = '01',
  TARJETA_DEBITO = '02',
  TARJETA_CREDITO = '03',
  TRANSFERENCIA  = '07',
  OTRO           = '99',
}

export class ItemCfDto {
  @IsNumber()
  numItem: number;

  // 1=Bien, 2=Servicio, 3=Ambos, 4=Otros
  @IsNumber()
  tipoItem: number;

  @IsNumber()
  @Min(0)
  cantidad: number;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  codigo?: string;

  // Unidad de medida según catálogo MH (59=Unidad, etc.)
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

  // Solo uno debe ser > 0
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

export class PagoDto {
  @IsEnum(CodigoPago)
  codigo: CodigoPago;

  @IsNumber()
  @Min(0)
  montoPago: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referencia?: string;

  /** Plazo de crédito: '01'=30 días, '02'=60 días, '03'=90 días, '04'=Otro */
  @IsOptional()
  @IsString()
  plazo?: string;

  /** Período: número de días cuando plazo='04' */
  @IsOptional()
  @IsNumber()
  @Min(1)
  periodo?: number;
}

export class ReceptorCfDto {
  /** Tipo documento: 13=DUI, 36=NIT, 37=Pasaporte, 03=Carné residente, 02=Carné extranjería */
  @IsOptional()
  @IsString()
  @Matches(/^(02|03|13|36|37)$/, { message: 'tipoDocumento debe ser 02, 03, 13, 36 o 37' })
  @ValidateIf(o => !!o.tipoDocumento)
  tipoDocumento?: string;

  /** Para NIT (tipoDocumento=36): exactamente 14 dígitos sin guiones (error 809 del firmador) */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numDocumento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;
}

export class CreateCfDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceptorCfDto)
  receptor?: ReceptorCfDto;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un ítem' })
  @ValidateNested({ each: true })
  @Type(() => ItemCfDto)
  items: ItemCfDto[];

  @IsEnum(CondicionOperacion)
  condicionOperacion: CondicionOperacion;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un pago' })
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos: PagoDto[];

  /** Retención de renta aplicada (si el receptor es agente retenedor) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  reteRenta?: number;

  /** Número de operación de pago electrónico (transferencia, tarjeta, etc.) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numPagoElectronico?: string;

  /** Nombre de quien entrega físicamente los bienes/servicios */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombEntrega?: string;

  /** Documento de quien entrega */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  docuEntrega?: string;

  /** Nombre de quien recibe */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombRecibe?: string;

  /** Documento de quien recibe */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  docuRecibe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  observaciones?: string;

  /** Código de sucursal (Establecimiento de Hacienda) */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  codEstable?: string;

  /** Código de punto de venta */
  @IsOptional()
  @IsString()
  @MaxLength(15)
  codPuntoVenta?: string;
}
