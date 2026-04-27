# Roadmap — Sistema DTE El Salvador

Proyecto: Facturación electrónica con NestJS + React 19 + Vite + PostgreSQL
Ambiente actual: Pruebas (MH homologación)
Última revisión: 2026-04-11

---

## ✅ Estado actual — TODO implementado

### Backend (NestJS)
- [x] Scaffold NestJS + TypeORM + PostgreSQL
- [x] GlobalValidationPipe (whitelist + transform)
- [x] Entidad `Dte` con estados: PENDIENTE, RECIBIDO, RECHAZADO, CONTINGENCIA, ANULADO
- [x] Entidad `Correlative` con bloqueo pesimista para numeración concurrente
- [x] Módulo `AuthMhService` — autenticación `x-www-form-urlencoded`, token 47h/23h
- [x] Módulo `SignerService` — 3 modos: Firmador Docker → JWS RS512 local → simulado
- [x] Módulo `TransmitterService` — 3 reintentos, 5s espera, contingencia automática
- [x] `CfService` — Factura Consumidor Final (tipo 01)
- [x] `CcfService` — Comprobante Crédito Fiscal (tipo 03)
- [x] `NotaService` — Nota de Crédito (05) y Nota de Débito (06) sobre CCF
- [x] `NreService` — Nota de Remisión (tipo 04)
- [x] `FexeService` — Factura de Exportación (tipo 11)
- [x] `InvalidacionService` — Anulación con documento tipo 06 al MH
- [x] `PdfService` — Representación gráfica con QR code (pdfkit + qrcode)
- [x] `ConsultaMhService` — Consulta estado DTE en MH
- [x] `ContingenciaService` — Cola, evento de contingencia, envío por lote (max 100)
- [x] Formato número de control correcto: `DTE-{tipo}-{codEstableMH}{codPdvMH}-{15dig}`
- [x] `totalLetras` con conversor `montoALetras()` completo
- [x] Validación ±30 minutos en CF y CCF
- [x] Firmador Docker corriendo: `rescuecrs/svfe-api-firmador` en puerto 8113

### Endpoints REST disponibles
```
POST   /api/dte/cf                    → Emitir CF
POST   /api/dte/ccf                   → Emitir CCF
POST   /api/dte/nc                    → Emitir Nota de Crédito (sobre CCF)
POST   /api/dte/nd                    → Emitir Nota de Débito (sobre CCF)
POST   /api/dte/nre                   → Emitir Nota de Remisión
POST   /api/dte/fexe                  → Emitir Factura Exportación
POST   /api/dte/retencion             → Emitir Comprobante de Retención (07)
POST   /api/dte/fse                   → Emitir Factura Sujeto Excluido (14)
POST   /api/dte/donacion              → Emitir Comprobante de Donación (15)
GET    /api/dte/dashboard/stats       → Estadísticas: totales, por tipo/estado, últimos 6 meses
GET    /api/dte                       → Listar DTEs (filtros: tipoDte, estado, q, page, limit)
GET    /api/dte/exportar/csv          → Exportar a CSV (mismos filtros, BOM UTF-8)
GET    /api/dte/:id                   → Obtener DTE
GET    /api/dte/:id/pdf               → Descargar PDF con QR
POST   /api/dte/:id/anular            → Invalidar DTE (estado RECIBIDO)
POST   /api/dte/:id/consultar-mh      → Sincronizar estado con MH
POST   /api/dte/:id/reintentar        → Reintentar DTE en CONTINGENCIA
GET    /api/dte/contingencia/cola     → Listar DTEs en contingencia
POST   /api/dte/contingencia/procesar → Registrar evento + enviar lote al MH

# POS (requiere cabecera X-API-Key: <POS_API_KEY>)
POST   /api/pos/cf                    → Emitir CF desde POS
POST   /api/pos/ccf                   → Emitir CCF desde POS
```

### Frontend (React 19 + Vite)
- [x] Sidebar + topbar + layout responsive
- [x] Sistema de diseño completo (variables CSS, badges, modales, tablas)
- [x] Listado de DTEs con búsqueda, filtros por tipo y estado, paginación
- [x] Tarjetas de estadísticas (total, recibidos, pendientes, rechazados, contingencia)
- [x] Formulario Factura CF (tipo 01)
- [x] Formulario Crédito Fiscal CCF (tipo 03)
- [x] Formulario Nota de Remisión NRE (tipo 04)
- [x] Formulario Factura Exportación FEXE (tipo 11)
- [x] Modal Nota de Crédito NC (tipo 05) desde detalle de CCF
- [x] Modal Nota de Débito ND (tipo 06) desde detalle de CCF
- [x] Vista detalle: todos los tipos (CF/CCF/NC/ND/NRE/FEXE), documento relacionado
- [x] Botón PDF en detalle
- [x] Modal de anulación con campos completos del MH
- [x] Botón "Consultar MH" para DTEs PENDIENTE/CONTINGENCIA
- [x] Página de Contingencia: cola, procesar lote, reintentar individual
- [x] Catálogo departamentos/municipios (14 dep., todos los municipios)
- [x] Catálogo actividades económicas CIIU Rev.4 (~200 con buscador)
- [x] Catálogo unidades de medida CAT-014 (59 unidades)
- [x] Selector departamento → municipio encadenado
- [x] Lista de países para FEXE (20 países frecuentes)

---

## ✅ 8 Mejoras — TODAS IMPLEMENTADAS

### Mejora 1 — Notificaciones por correo (Nodemailer) ✅
- [x] Instalado `nodemailer` + `@types/nodemailer` en backend
- [x] Creado `NotificationsModule` (global) + `EmailService`
- [x] Email HTML con detalle del DTE enviado tras emitir CF y CCF
- [x] Variables `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- [x] Wiring en `CfService` y `CcfService` (cuando receptor tiene correo)

### Mejora 2 — Dashboard con gráficas (Recharts) ✅
- [x] Instalado `recharts` en frontend
- [x] Endpoint `GET /api/dte/dashboard/stats` (totales por tipo, estado, últimos 6 meses)
- [x] Página `/` (Dashboard) con PieChart estados + BarChart por tipo + BarChart mensual
- [x] Enlace "Dashboard" en sidebar; DTEs en `/dtes`

### Mejora 3 — Exportar DTEs a CSV ✅
- [x] Endpoint `GET /api/dte/exportar/csv` (mismos filtros que listar, sin paginación, BOM UTF-8)
- [x] Botón "↓ CSV" en DteList que descarga con filtros activos

### Mejora 4 — Búsqueda server-side ✅
- [x] Parámetro `q` en `GET /api/dte` usando QueryBuilder + Brackets con LOWER LIKE
- [x] Removido filtro client-side en DteList
- [x] Debounce 400ms en el input de búsqueda
- [x] Parámetro `q` en `dteApi.listar()`

### Mejora 5 — Comprobante de Retención (tipo 07) ✅
- [x] `create-retencion.dto.ts`
- [x] `retencion.service.ts` registrado en `dte.module.ts`
- [x] `POST /api/dte/retencion`
- [x] Formulario `NuevaRetencion.tsx`
- [x] Tipos, labels y rutas actualizados

### Mejora 6 — Factura de Sujeto Excluido (tipo 14) ✅
- [x] `create-fse.dto.ts`
- [x] `fse.service.ts` registrado en `dte.module.ts`
- [x] `POST /api/dte/fse`
- [x] Formulario `NuevaFse.tsx`
- [x] Tipos, labels y rutas actualizados

### Mejora 7 — Comprobante de Donación (tipo 15) ✅
- [x] `create-donacion.dto.ts`
- [x] `donacion.service.ts` registrado en `dte.module.ts`
- [x] `POST /api/dte/donacion`
- [x] Formulario `NuevaDonacion.tsx`
- [x] Tipos, labels y rutas actualizados

### Mejora 8 — Integración POS (API Key auth) ✅
- [x] `ApiKeyGuard` con `crypto.timingSafeEqual` (protección timing attack)
- [x] `PosModule` + `PosController` con `POST /api/pos/cf` y `POST /api/pos/ccf`
- [x] Variable `.env`: `POS_API_KEY=pos-dev-key-cambiar-en-produccion`
- [x] `CfService` y `CcfService` exportados desde `DteModule`

---

## ✅ Mejoras conformidad MH — IMPLEMENTADAS (2026-04-14)

- [x] **URLs corregidas** — Dominio oficial `dtes.mh.gob.sv` según Manual Técnico v1.0 (antes `apifacturatest.mh.gob.sv`)
- [x] **Vigencia token** — Comentario explícito: `'00'`=pruebas=48h, `'01'`=prod=24h (lógica ya era correcta)
- [x] **Nuevo método `invalidarToken`** en `AuthMhService` para forzar re-auth ante 401
- [x] **Política de reintentos completa** — `TransmitterService` consulta estado del DTE antes de cada reintento (sección 3.3 manual MH)
- [x] **Manejo 401** — `TransmitterService` detecta 401, invalida caché de token y reintenta con token fresco automáticamente
- [x] **`consultarResultadoLote`** en `ContingenciaService` + endpoint `GET /api/dte/contingencia/lote/:codigoLote` para polling post-contingencia (sección 4.3.2)
- [x] **`horaInicio`/`horaFin` reales** en evento de contingencia (antes hardcodeado a `'00:00:00'`)
- [x] **Validación horaria de lotes** — log de advertencia si se envía fuera del horario permitido (pruebas: 08-17h, prod: 22-05h); contingencias exentas 24/7
- [x] **Ambiente unificado** — `correlatives.service.ts` usa `'00'` como default (antes `'1'` inconsistente)
- [x] **Validación NIT** en `ReceptorCcfDto`: regex `^\d{14}$` — evita error 809 del firmador
- [x] **Validación NRC** en `ReceptorCcfDto`: regex `^\d{1,8}$`
- [x] **Validación tipoDocumento** en `ReceptorCfDto`: solo valores `02|03|13|36|37`
- [x] **`MH_LOTE_CONSULTA_URL`** añadida al `.env` (antes faltaba esta variable)
- [x] URLs de producción documentadas como comentarios en `.env`

## 🟡 Pendiente — Para producción

### Para ambiente de producción
- [ ] Registrarse como emisor electrónico en el MH (formulario F-210)
- [ ] Obtener certificado digital real (.p12) del MH
- [ ] Colocar certificado en `backend/certificados/<NIT>.crt`
- [ ] Cambiar `MH_AMBIENTE=01` en `.env`
- [ ] Descomentar URLs de producción en `.env` (dominio `api.dtes.mh.gob.sv`)
- [ ] Cambiar `MODO_DEMO=false` en `.env`

### Mejoras opcionales — TODAS IMPLEMENTADAS ✅
- [x] Notificación por correo al emitir (Nodemailer, CF+CCF)
- [x] Dashboard con gráficas (Recharts, PieChart + BarChart)
- [x] Exportar lista de DTEs a CSV/Excel (BOM UTF-8)
- [x] Integración directa con POS (endpoint `/api/pos/cf` con API Key)
- [x] Comprobante de Retención (tipo 07)
- [x] Factura de Sujeto Excluido (tipo 14)
- [x] Comprobante de Donación (tipo 15)
- [x] Búsqueda server-side con debounce 400ms

---

## 📁 Estructura actual del proyecto

```
Facturacion/
├── backend/
│   ├── certificados/         ← .crt del MH (vacío en pruebas)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── auth-mh/
│   │   │   ├── auth-mh.module.ts
│   │   │   └── auth-mh.service.ts
│   │   ├── correlatives/
│   │   │   ├── correlatives.module.ts
│   │   │   ├── correlatives.service.ts
│   │   │   └── entities/correlative.entity.ts
│   │   ├── dte/
│   │   │   ├── dte.module.ts
│   │   │   ├── controllers/dte.controller.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-cf.dto.ts
│   │   │   │   ├── create-ccf.dto.ts
│   │   │   │   ├── create-nota.dto.ts      (NC + ND)
│   │   │   │   ├── create-nre.dto.ts
│   │   │   │   ├── create-fexe.dto.ts
│   │   │   │   └── invalidar-dte.dto.ts
│   │   │   ├── entities/dte.entity.ts
│   │   │   └── services/
│   │   │       ├── cf.service.ts
│   │   │       ├── ccf.service.ts
│   │   │       ├── nota.service.ts         (NC + ND)
│   │   │       ├── nre.service.ts
│   │   │       ├── fexe.service.ts
│   │   │       ├── retencion.service.ts    (tipo 07)
│   │   │       ├── fse.service.ts          (tipo 14)
│   │   │       ├── donacion.service.ts     (tipo 15)
│   │   │       ├── invalidacion.service.ts
│   │   │       ├── pdf.service.ts
│   │   │       ├── consulta-mh.service.ts
│   │   │       ├── contingencia.service.ts
│   │   │       ├── signer.service.ts
│   │   │       └── transmitter.service.ts
│   │   ├── notifications/
│   │   │   ├── notifications.module.ts
│   │   │   └── email.service.ts
│   │   ├── pos/
│   │   │   ├── pos.module.ts
│   │   │   ├── pos.controller.ts
│   │   │   └── api-key.guard.ts
│   │   └── utils/
│   │       └── numero-letras.ts
│   └── .env
└── frontend/
    └── src/
        ├── App.tsx
        ├── App.css
        ├── index.css
        ├── api/dte.api.ts
        ├── types/dte.ts
        ├── catalogs/
        │   ├── departamentos.ts
        │   ├── actividades.ts
        │   └── unidades.ts
        ├── components/
        │   ├── EstadoBadge.tsx
        │   ├── DireccionFields.tsx
        │   └── ActividadSelect.tsx
        └── pages/
            ├── dtes/
            │   ├── DteList.tsx
            │   └── DteDetalle.tsx
            ├── dashboard/Dashboard.tsx
            ├── cf/NuevoCf.tsx
            ├── ccf/NuevoCcf.tsx
            ├── nre/NuevaNre.tsx
            ├── fexe/NuevaFexe.tsx
            ├── retencion/NuevaRetencion.tsx
            ├── fse/NuevaFse.tsx
            ├── donacion/NuevaDonacion.tsx
            ├── notas/NuevaNotaModal.tsx
            └── contingencia/Contingencia.tsx
```

---

## 🔗 Referencias oficiales MH

| Recurso | URL |
|---------|-----|
| Portal oficial DTE | https://factura.gob.sv |
| Consulta DTEs (pruebas) | https://test7.mh.gob.sv/ssc/consulta/fe/ |
| Consulta DTEs (producción) | https://portaldgii.mh.gob.sv/ssc/consulta/fe/ |
| API pruebas | https://apifacturatest.mh.gob.sv |
| API producción | https://apifactura.mh.gob.sv |
| Certificado prueba (comunidad) | https://gist.github.com/mcalero11/03af55c0e9872407b121dd77cc41f833 |
| Manual técnico PDF | https://transparencia.mh.gob.sv/downloads/pdf/700-DGII-MN-2023-002.pdf |
| Soporte técnico MH | https://soportefactura.mh.gob.sv/ |

---

## 🐳 Docker Firmador

```bash
# Imagen en uso (puerto 8113, certificados en /uploads)
docker run -d --name svfe-firmador --restart unless-stopped \
  -p 8113:8113 \
  -v /ruta/a/certificados:/uploads \
  rescuecrs/svfe-api-firmador

# Ver logs
docker logs svfe-firmador -f

# Endpoint que usa el sistema
POST http://localhost:8113/firmardocumento/
Body: { nit, activo, passwordPri, dteJson }
```

---

## ⚙️ Variables de entorno (.env)

```env
# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=facturacion_dte

# App
PORT=3002
NODE_ENV=development

# MH Ambiente (00=pruebas, 01=producción)
MH_AMBIENTE=00
MH_AUTH_URL=https://apifacturatest.mh.gob.sv/auth
MH_API_URL=https://apifacturatest.mh.gob.sv/fesv/recepciondte
MH_CONSULTA_URL=https://apifacturatest.mh.gob.sv/fesv/recepcion/consultadte
MH_ANULAR_URL=https://apifacturatest.mh.gob.sv/fesv/anulardte
MH_CONTINGENCIA_URL=https://apifacturatest.mh.gob.sv/fesv/contingencia
MH_LOTE_URL=https://apifacturatest.mh.gob.sv/fesv/recepcionlote
MH_QR_BASE_URL=https://test7.mh.gob.sv/ssc/consulta/fe/

# Credenciales MH
MH_NIT=06141804941035
MH_NRC=2024036
MH_PASS_CERT=12345678

# Datos del emisor
EMISOR_NOMBRE=EMPRESA DE PRUEBA SA DE CV
EMISOR_NOMBRE_COMERCIAL=EMPRESA PRUEBA
EMISOR_NIT=06141804941035
EMISOR_NRC=2024036
EMISOR_COD_ACTIVIDAD=47190
EMISOR_DESC_ACTIVIDAD=Venta al por menor de otros productos
EMISOR_TIPO_ESTABLECIMIENTO=01
EMISOR_COD_ESTABLE_MH=M001
EMISOR_COD_PUNTO_VENTA_MH=P001
EMISOR_DEPARTAMENTO=06
EMISOR_MUNICIPIO=23
EMISOR_COMPLEMENTO=Calle Principal #123
EMISOR_TELEFONO=22221111
EMISOR_CORREO=prueba@empresa.com.sv

# Firmador Docker
FIRMADOR_URL=http://localhost:8113

# POS Integration
POS_API_KEY=pos-dev-key-cambiar-en-produccion

# SMTP (opcional, para notificaciones por email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@empresa.com.sv
```
