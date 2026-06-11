-- ============================================================
-- Migración: Extension Planes v3 — Básico / Pro / Ilimitado
-- Alinea el backend con los 3 planes hardcodeados en la
-- extensión iFactu_Conta + historial de pagos.
-- Ejecutar en prod ANTES de desplegar el nuevo backend.
-- ============================================================

-- 1. Features por plan en extension_plan_config
ALTER TABLE extension_plan_config
  ADD COLUMN IF NOT EXISTS "maxCuentasCorreo" INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "incluyeF07"       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "incluyeExcel"     BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Desactivar los planes del esquema anterior (las licencias ya
--    vendidas siguen funcionando; solo dejan de ofrecerse en la web)
UPDATE extension_plan_config
SET activo = FALSE
WHERE tipo IN ('monthly', 'annual', 'lifetime_1', 'lifetime_2', 'lifetime_5');

-- 3. Seed de los 3 planes nuevos (mensuales).
--    PRECIOS PROVISIONALES — ajustar desde el panel superadmin
--    junto con n1coPlanId y paymentLinkUrl antes de vender.
INSERT INTO extension_plan_config
  (tipo, nombre, descripcion, precio, "maxDtesMes", "maxDispositivos",
   "maxCuentasCorreo", "incluyeF07", "incluyeExcel", activo)
VALUES
  ('basico',    'Básico',    '150 DTEs/mes · 1 cuenta de correo',                          4.99,  150, 1, 1, FALSE, FALSE, TRUE),
  ('pro',       'Pro',       '500 DTEs/mes · 3 cuentas · Anexo F-07 · Excel',              9.99,  500, 2, 3, TRUE,  TRUE,  TRUE),
  ('ilimitado', 'Ilimitado', 'DTEs ilimitados · cuentas ilimitadas · todo incluido',       19.99, 0,   3, 0, TRUE,  TRUE,  TRUE)
ON CONFLICT (tipo) DO UPDATE SET
  "maxDtesMes"       = EXCLUDED."maxDtesMes",
  "maxCuentasCorreo" = EXCLUDED."maxCuentasCorreo",
  "incluyeF07"       = EXCLUDED."incluyeF07",
  "incluyeExcel"     = EXCLUDED."incluyeExcel",
  activo             = TRUE;

-- 4. Historial de pagos de la extensión (+ idempotencia de webhook)
CREATE TABLE IF NOT EXISTS extension_pagos (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "licenseId" UUID,
  "orderCode" VARCHAR(200)  NOT NULL,
  "planTipo"  VARCHAR(50),
  monto       DECIMAL(10,2),
  email       VARCHAR,
  nombre      VARCHAR,
  payload     JSONB,
  "createdAt" TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_extension_pagos_orderCode"
  ON extension_pagos ("orderCode");
