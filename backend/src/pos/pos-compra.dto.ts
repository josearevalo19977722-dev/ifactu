import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Payload que Nexa envía a iFactu para registrar una compra a proveedor.
 * POST /api/pos/compra
 */
export class PosCompraDto {
  /** Tipo de DTE recibido: '03'=CCF, '01'=CF, '11'=FEXE, '14'=FSE, etc. */
  @IsString()
  tipoDte: string;

  /** Número de control del DTE (ej: DTE-03-M001P001-000000000000001) */
  @IsOptional()
  @IsString()
  numeroControl?: string;

  /** UUID único asignado por Hacienda — llave principal de deduplicación */
  @IsOptional()
  @IsString()
  codigoGeneracion?: string;

  /** Fecha de emisión del DTE (YYYY-MM-DD) */
  @IsDateString()
  fechaEmision: string;

  /** NIT del proveedor (14 dígitos) */
  @IsOptional()
  @IsString()
  proveedorNit?: string;

  /** NRC del proveedor */
  @IsOptional()
  @IsString()
  proveedorNrc?: string;

  /** Razón social / nombre del proveedor */
  @IsString()
  proveedorNombre: string;

  /** Monto gravado (base para IVA) */
  @IsNumber()
  @Min(0)
  compraGravada: number;

  /** Monto exento */
  @IsOptional()
  @IsNumber()
  @Min(0)
  compraExenta?: number;

  /** Monto no sujeto */
  @IsOptional()
  @IsNumber()
  @Min(0)
  compraNoSujeta?: number;

  /**
   * IVA crédito fiscal (13% de compraGravada).
   * Si se omite, iFactu lo calcula automáticamente.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  ivaCredito?: number;

  /** Total de la factura (gravada + exenta + noSujeta + iva) */
  @IsNumber()
  @Min(0)
  totalCompra: number;

  /** Descripción o referencia interna libre */
  @IsOptional()
  @IsString()
  descripcion?: string;
}
