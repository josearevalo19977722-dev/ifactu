-- ============================================================
-- Migración: variante "plan + actualizaciones de por vida"
-- Cada plan puede tener un segundo payment link N1CO que incluye
-- el add-on de updates en un solo checkout (checkbox en la tienda).
-- Ejecutar en prod ANTES de desplegar el nuevo backend.
-- ============================================================

ALTER TABLE extension_plan_config
  ADD COLUMN IF NOT EXISTS "n1coPlanIdConUpdates"     INT,
  ADD COLUMN IF NOT EXISTS "paymentLinkUrlConUpdates" VARCHAR(500);
