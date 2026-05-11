-- Migración: Tabla usuario_empresas para soporte multi-empresa de CONTADOR
-- Ejecutar en PostgreSQL con:
-- docker exec -i ifactu_db psql -U postgres -d facturacion < migration_usuario_empresas.sql

CREATE TABLE IF NOT EXISTS usuario_empresas (
  "usuarioId" uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  "empresaId" uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  PRIMARY KEY ("usuarioId", "empresaId")
);

CREATE INDEX IF NOT EXISTS idx_usuario_empresas_usuario ON usuario_empresas ("usuarioId");
CREATE INDEX IF NOT EXISTS idx_usuario_empresas_empresa ON usuario_empresas ("empresaId");
