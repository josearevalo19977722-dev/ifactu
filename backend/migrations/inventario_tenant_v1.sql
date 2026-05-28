-- Migración: inventario_tenant_v1
-- Agrega empresaId a la tabla productos para aislar inventario por tenant.
-- Seguro ejecutar en producción (ADD COLUMN IF NOT EXISTS, nullable).

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS "empresaId" varchar DEFAULT NULL;

-- Índice para acelerar los filtros por tenant
CREATE INDEX IF NOT EXISTS idx_productos_empresa
  ON productos ("empresaId");

-- Índice compuesto para buscarOCrear (nombre + empresaId)
CREATE INDEX IF NOT EXISTS idx_productos_nombre_empresa
  ON productos (LOWER(nombre), "empresaId");
