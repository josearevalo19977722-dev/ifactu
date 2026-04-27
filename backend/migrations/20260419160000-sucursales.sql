-- Sucursales por empresa (catálogo MH). Ejecutar si la tabla no existe (p. ej. sin synchronize).

CREATE TABLE IF NOT EXISTS sucursales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR NOT NULL,
  direccion VARCHAR NOT NULL,
  telefono VARCHAR,
  "codEstableMh" VARCHAR(4) NOT NULL,
  "empresaId" UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  CONSTRAINT uq_sucursales_empresa_cod UNIQUE ("empresaId", "codEstableMh")
);

CREATE INDEX IF NOT EXISTS idx_sucursales_empresa ON sucursales ("empresaId");
