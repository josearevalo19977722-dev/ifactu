-- Producción: ejecutar si synchronize está desactivado
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS tipos_dte_habilitados jsonb;

COMMENT ON COLUMN empresa.tipos_dte_habilitados IS 'Códigos MH 01,03,… permitidos; NULL = todos';
