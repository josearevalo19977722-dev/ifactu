-- ============================================================
-- Migración: Extension License v2
-- Añade campos de plan/uso, tabla de dispositivos y planes
-- Ejecutar en prod ANTES de desplegar el nuevo backend
-- ============================================================

-- 1. Columnas nuevas en extension_licenses
ALTER TABLE extension_licenses
  ADD COLUMN IF NOT EXISTS plan           VARCHAR(50)   NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "maxDtesMes"   INT           NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS "dtesUsadosMes" INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dtesResetAt"  TIMESTAMPTZ   NULL,
  ADD COLUMN IF NOT EXISTS "n1coOrderCode" VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS "updatedAt"    TIMESTAMPTZ   NOT NULL DEFAULT NOW();

-- Retrocompatibilidad: licencias de origen ifactu = ilimitado
UPDATE extension_licenses SET plan = 'ifactu', "maxDtesMes" = 0 WHERE origen = 'ifactu';

-- 2. Tabla de dispositivos activados
CREATE TABLE IF NOT EXISTS license_devices (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "licenseId"         UUID        NOT NULL,
  fingerprint         VARCHAR(64) NOT NULL,
  "nombreDispositivo" VARCHAR(200),
  "activadoAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastSeen"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("licenseId", fingerprint)
);

-- 3. Tabla de planes de la extensión
CREATE TABLE IF NOT EXISTS extension_plan_config (
  tipo               VARCHAR(50)       NOT NULL PRIMARY KEY,
  nombre             VARCHAR(100)      NOT NULL,
  descripcion        TEXT,
  precio             DECIMAL(10,2)     NOT NULL DEFAULT 0,
  "maxDtesMes"       INT               NOT NULL DEFAULT 500,
  "maxDispositivos"  INT               NOT NULL DEFAULT 1,
  "n1coPlanId"       INT,
  "paymentLinkUrl"   VARCHAR(500),
  activo             BOOLEAN           NOT NULL DEFAULT TRUE,
  "updatedAt"        TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- 4. Seed inicial de planes (ajusta precios según tu oferta)
INSERT INTO extension_plan_config (tipo, nombre, descripcion, precio, "maxDtesMes", "maxDispositivos", activo)
VALUES
  ('monthly',    'Mensual',               'Acceso mensual — cancela cuando quieras', 9.99,  500, 1, TRUE),
  ('annual',     'Anual',                 'Acceso 12 meses — ahorra 20%',            95.88, 500, 2, TRUE),
  ('lifetime_1', 'Vitalicio (1 equipo)',  'Pago único — uso de por vida en 1 PC',    149,   0,   1, TRUE),
  ('lifetime_2', 'Vitalicio (2 equipos)', 'Pago único — uso de por vida en 2 PCs',   199,   0,   2, TRUE),
  ('lifetime_5', 'Vitalicio (5 equipos)', 'Pago único — uso de por vida en 5 PCs',   299,   0,   5, TRUE)
ON CONFLICT (tipo) DO NOTHING;
