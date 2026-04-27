import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CondicionOperacion, PagoDto } from './create-cf.dto';

export class ItemCcfDto {
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

  /** Campo UI: indica si el precio ingresado ya incluye IVA. El servicio lo maneja internamente. */
  @IsOptional()
  @IsBoolean()
  incluyeIva?: boolean;
}

export class ReceptorCcfDto {
  /** NIT del receptor: 14 dígitos. Se normalizan guiones/espacios automáticamente. */
  @Transform(({ value }) => typeof value === 'string' ? value.replace(/[-\s]/g, '') : value)
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{14}$/, { message: 'nit debe tener exactamente 14 dígitos numéricos (con o sin guiones)' })
  nit: string;

  /** NRC del receptor: 1 a 8 dígitos. Se normaliza guión automáticamente. */
  @Transform(({ value }) => typeof value === 'string' ? value.replace(/[-\s]/g, '') : value)
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{1,8}$/, { message: 'nrc debe tener entre 1 y 8 dígitos numéricos' })
  nrc: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  nombreComercial?: string;

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

  @IsOptional()
  @IsBoolean()
  esGranContribuyente?: boolean;
}

export class CreateCcfDto {
  @ValidateNested()
  @Type(() => ReceptorCcfDto)
  receptor: ReceptorCcfDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemCcfDto)
  items: ItemCcfDto[];

  @IsEnum(CondicionOperacion)
  condicionOperacion: CondicionOperacion;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagoDto)
  pagos: PagoDto[];

  /** Retención de renta aplicada */
  @IsOptional()
  @IsNumber()
  @Min(0)
  reteRenta?: number;

  /** Número de operación de pago electrónico */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numPagoElectronico?: string;

  /** Nombre de quien entrega físicamente */
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
