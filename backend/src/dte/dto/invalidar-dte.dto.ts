import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class InvalidarDteDto {
  /** UUID del DTE a anular (id interno) */
  @IsUUID()
  @IsNotEmpty()
  dteId: string;

  /**
   * Tipo de anulación:
   *  1 = Error en datos del documento
   *  2 = Rescindir operación
   *  3 = Otro
   * Acepta tanto número como string ("1","2","3") para compatibilidad con POS.
   */
  @Transform(({ value }) => Number(value))
  @IsIn([1, 2, 3])
  tipoAnulacion: 1 | 2 | 3;

  @IsString()
  @IsNotEmpty()
  motivoAnulacion: string;

  @IsString()
  @IsNotEmpty()
  nombreResponsable: string;

  /** Tipo doc: 36=DUI, 37=NIT, 13=Otro. Default '13' si no se envía. */
  @IsOptional()
  @IsString()
  tipDocResponsable?: string;

  @IsString()
  @IsNotEmpty()
  numDocResponsable: string;

  /**
   * Quien solicita la anulación. Si se omite, se usa el mismo responsable.
   * Simplifica la integración desde POS donde responsable y solicitante son el mismo.
   */
  @IsOptional()
  @IsString()
  nombreSolicita?: string;

  @IsOptional()
  @IsString()
  tipDocSolicita?: string;

  @IsOptional()
  @IsString()
  numDocSolicita?: string;
}
