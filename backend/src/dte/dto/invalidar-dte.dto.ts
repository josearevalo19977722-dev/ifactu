import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

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
   */
  @IsIn([1, 2, 3])
  tipoAnulacion: 1 | 2 | 3;

  @IsString()
  @IsNotEmpty()
  motivoAnulacion: string;

  @IsString()
  @IsNotEmpty()
  nombreResponsable: string;

  /** Tipo doc: 36=DUI, 37=NIT, etc. */
  @IsString()
  @IsNotEmpty()
  tipDocResponsable: string;

  @IsString()
  @IsNotEmpty()
  numDocResponsable: string;

  @IsString()
  @IsNotEmpty()
  nombreSolicita: string;

  @IsString()
  @IsNotEmpty()
  tipDocSolicita: string;

  @IsString()
  @IsNotEmpty()
  numDocSolicita: string;
}
