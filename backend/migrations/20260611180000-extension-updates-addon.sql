-- ============================================================
-- Migración: Add-on "Actualizaciones de por vida" ($5 único)
-- + planes basico/pro/ilimitado pasan a pago único (sin vencer)
-- Ejecutar en prod ANTES de desplegar el nuevo backend.
-- ============================================================

-- 1. Flag en la licencia (no en el plan: sobrevive a upgrades)
ALTER TABLE extension_licenses
  ADD COLUMN IF NOT EXISTS "updatesLifetime" BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Los planes nuevos son pago único: limpiar vencimientos que se
--    hayan creado con el esquema anterior de 31 días
UPDATE extension_licenses
SET "expiresAt" = NULL
WHERE plan IN ('basico', 'pro', 'ilimitado');

-- 3. Pseudo-plan para el add-on (precio neto, la web agrega 13% IVA).
--    Configurar n1coPlanId y paymentLinkUrl desde el panel superadmin.
--    La web lo separa de los planes por su tipo 'updates'.
INSERT INTO extension_plan_config
  (tipo, nombre, descripcion, precio, "maxDtesMes", "maxDispositivos",
   "maxCuentasCorreo", "incluyeF07", "incluyeExcel", activo)
VALUES
  ('updates', 'Actualizaciones de por vida',
   'Funciones nuevas y adaptaciones a cambios de Hacienda, para siempre. Pago único, válido aunque cambies de plan.',
   5.00, 0, 0, 0, FALSE, FALSE, TRUE)
ON CONFLICT (tipo) DO NOTHING;
