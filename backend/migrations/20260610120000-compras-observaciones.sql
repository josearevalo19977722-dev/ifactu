-- Migración: agregar columna observaciones a compras
-- Fecha: 2026-06-10
-- Propósito: permitir al contador registrar notas sobre compras que requieren
--            revisión (DTE anulado por proveedor, discrepancia de IVA, etc.)
--
-- Segura para ejecutar en producción: ADD COLUMN IF NOT EXISTS no falla si ya existe

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

COMMENT ON COLUMN compras.observaciones IS
  'Notas del contador: ej. "Verificar con proveedor", "DTE anulado — pendiente NC".
   También se usa para marcar compras con discrepancia de IVA detectada por el sistema.';
