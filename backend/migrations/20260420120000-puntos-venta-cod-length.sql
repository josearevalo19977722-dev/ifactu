-- Ampliar código punto de venta MH (alineado con JSON DTE y DTO hasta 15 caracteres)
ALTER TABLE puntos_venta
  ALTER COLUMN "codPuntoVentaMh" TYPE varchar(15);
