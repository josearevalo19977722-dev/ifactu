# 📡 Guía Técnica de Integración: Nexa SaaS → iFactu DTE

**Versión:** 1.0  
**Fecha:** Abril 2026  
**Sistema fuente:** Nexa SaaS (Multi-tenant POS)  
**Sistema destino:** iFactu (Facturación Electrónica El Salvador — MH)

---

## Índice
1. [Autenticación y Configuración Base](#1-autenticación-y-configuración-base)
2. [Emitir Factura Consumidor Final (CF - Tipo 01)](#2-emitir-factura-consumidor-final-cf---tipo-01)
3. [Emitir Crédito Fiscal (CCF - Tipo 03)](#3-emitir-crédito-fiscal-ccf---tipo-03)
4. [Respuesta Estándar de Hacienda](#4-respuesta-estándar-de-hacienda)
5. [Anular / Invalidar un DTE](#5-anular--invalidar-un-dte)
6. [Manejo de Errores](#6-manejo-de-errores)
7. [Catálogos Oficiales de Referencia](#7-catálogos-oficiales-de-referencia)
8. [Flujo Completo de una Venta (Diagrama)](#8-flujo-completo-de-una-venta-diagrama)
9. [Checklist de Producción](#9-checklist-de-producción)

---

## 1. Autenticación y Configuración Base

### URL Base
```
https://ifactu.jsolutionsv.com/api/pos
```

> [!IMPORTANT]
> Todas las peticiones deben ir por **HTTPS**. Las peticiones HTTP sin SSL serán rechazadas.

### Cabeceras Obligatorias

Cada petición debe incluir las siguientes cabeceras:

```http
Content-Type: application/json
X-API-Key: nx_live_XXXXXXXXXXXXXXXX
```

La `X-API-Key` es la llave interna generada por iFactu para el comercio. El sistema la usa para:
1. Identificar a qué empresa pertenece la solicitud.
2. Aplicar el correlativo y los datos fiscales correctos del emisor.
3. Asociar el DTE al tenant correcto en la base de datos.

> [!CAUTION]
> **Nunca expongas la API Key en el frontend de Nexa.** Debe guardarse únicamente en las variables de entorno del backend de Nexa (`IFACTU_API_KEY`). Si la llave se compromete, el comercio debe regenerarla desde el panel de iFactu.

---

## 2. Emitir Factura Consumidor Final (CF - Tipo 01)

Se usa para ventas a personas naturales sin NIT o con compras menores a $200.

### Endpoint
```
POST /api/pos/cf
```

### Payload Completo (todos los campos)
```json
{
  "codEstable": "0001",
  "codPuntoVenta": "P001",
  "condicionOperacion": 1,
  "receptor": {
    "tipoDocumento": "13",
    "numDocumento": "01234567-8",
    "nombre": "JUAN PEREZ",
    "correo": "juan@email.com",
    "telefono": "78901234"
  },
  "items": [
    {
      "numItem": 1,
      "tipoItem": 1,
      "cantidad": 2,
      "codigo": "PROD-001",
      "uniMedida": 59,
      "descripcion": "Camiseta Algodón Talla L",
      "precioUni": 17.00,
      "montoDescu": 0.00,
      "ventaGravada": 34.00,
      "ventaExenta": 0.00,
      "ventaNoSuj": 0.00
    }
  ],
  "pagos": [
    {
      "codigo": "01",
      "montoPago": 34.00,
      "referencia": null
    }
  ],
  "reteRenta": 0,
  "numPagoElectronico": null,
  "observaciones": null
}
```

### Descripción de Campos

#### Raíz del documento

| Campo | Tipo | Req. | Descripción |
| :--- | :--- | :--- | :--- |
| `codEstable` | `string` (4 chars) | Opcional | Código de sucursal asignado por Hacienda (ej: `"0001"`). Si se omite, usa la sucursal principal del comercio. |
| `codPuntoVenta` | `string` (máx 15) | Opcional | Código de caja/terminal (ej: `"P001"`). Si se omite, usa el principal. |
| `condicionOperacion` | `number` | **Requerido** | `1` = Contado, `2` = Crédito, `3` = Otro |
| `reteRenta` | `number` | Opcional | Monto de retención de ISR si aplica. Default `0`. |
| `numPagoElectronico` | `string` | Opcional | Número de referencia de pago electrónico. |
| `observaciones` | `string` | Opcional | Máximo 3000 caracteres. |

#### Objeto `receptor` (Opcional para CF)

| Campo | Tipo | Req. | Descripción |
| :--- | :--- | :--- | :--- |
| `tipoDocumento` | `string` | Opcional | `"02"` = Carné Extranjería, `"03"` = Carné Residente, `"13"` = DUI, `"36"` = NIT, `"37"` = Pasaporte |
| `numDocumento` | `string` | Opcional | Número del documento sin guiones. Máx 20 chars. |
| `nombre` | `string` | Opcional | Nombre completo del cliente. Máx 250 chars. |
| `correo` | `string` | Opcional | Email del cliente. iFactu enviará confirmación automáticamente. Máx 100 chars. |
| `telefono` | `string` | Opcional | Teléfono del cliente. Máx 30 chars. |

#### Array `items` (mínimo 1 ítem)

| Campo | Tipo | Req. | Descripción |
| :--- | :--- | :--- | :--- |
| `numItem` | `number` | **Requerido** | Número de línea (1, 2, 3...). |
| `tipoItem` | `number` | **Requerido** | `1` = Bien, `2` = Servicio, `3` = Ambos, `4` = Otros |
| `cantidad` | `number` | **Requerido** | Cantidad vendida. Mínimo 0. |
| `codigo` | `string` | Opcional | Código interno del producto. Máx 25 chars. |
| `uniMedida` | `number` | **Requerido** | Código según catálogo CAT-014 de Hacienda. Ver [Catálogo de unidades](#catálogo-unidades-de-medida-cat-014). |
| `descripcion` | `string` | **Requerido** | Descripción del producto/servicio. Máx 1000 chars. |
| `precioUni` | `number` | **Requerido** | Precio unitario **con IVA incluido**. |
| `montoDescu` | `number` | **Requerido** | Monto de descuento. Poner `0` si no hay. |
| `ventaGravada` | `number` | **Requerido** | Subtotal de venta afecta al IVA (`precioUni × cantidad - montoDescu`). |
| `ventaExenta` | `number` | **Requerido** | Subtotal exento de IVA. Poner `0` si no aplica. |
| `ventaNoSuj` | `number` | **Requerido** | Subtotal no sujeto a IVA. Poner `0` si no aplica. |

> [!TIP]
> Solo uno de `ventaGravada`, `ventaExenta` o `ventaNoSuj` debe ser mayor que cero por ítem. iFactu calcula el IVA automáticamente.

#### Array `pagos` (mínimo 1)

| Campo | Tipo | Req. | Descripción |
| :--- | :--- | :--- | :--- |
| `codigo` | `string` | **Requerido** | `"01"` = Efectivo, `"02"` = Tarjeta Débito, `"03"` = Tarjeta Crédito, `"07"` = Transferencia, `"99"` = Otro |
| `montoPago` | `number` | **Requerido** | Monto pagado con este método. |
| `referencia` | `string` | Opcional | Número de referencia de la transacción. |
| `plazo` | `string` | Opcional | Solo si `condicionOperacion = 2` (Crédito): `"01"` = 30 días, `"02"` = 60 días, `"03"` = 90 días, `"04"` = Otro |
| `periodo` | `number` | Opcional | Número de días si `plazo = "04"`. |

### Ejemplo Mínimo (Venta Rápida)
```json
{
  "condicionOperacion": 1,
  "items": [
    {
      "numItem": 1,
      "tipoItem": 2,
      "cantidad": 1,
      "uniMedida": 59,
      "descripcion": "Servicio de lavado básico",
      "precioUni": 10.00,
      "montoDescu": 0.00,
      "ventaGravada": 10.00,
      "ventaExenta": 0.00,
      "ventaNoSuj": 0.00
    }
  ],
  "pagos": [{ "codigo": "01", "montoPago": 10.00 }]
}
```

---

## 3. Emitir Crédito Fiscal (CCF - Tipo 03)

Se usa para ventas a empresas con NRC. Permite deducción de IVA por parte del receptor.

### Endpoint
```
POST /api/pos/ccf
```

### Payload Completo
```json
{
  "codEstable": "0001",
  "codPuntoVenta": "P001",
  "condicionOperacion": 1,
  "receptor": {
    "nit": "06140102031050",
    "nrc": "123456",
    "nombre": "EMPRESA CLIENTE S.A. DE C.V.",
    "nombreComercial": "Empresa Ejemplo",
    "codActividad": "47190",
    "descActividad": "Venta al por menor de otros productos",
    "direccionDepartamento": "06",
    "direccionMunicipio": "14",
    "direccionComplemento": "Calle Arce #150, Local 3",
    "telefono": "22991100",
    "correo": "facturacion@empresa.com",
    "esGranContribuyente": false
  },
  "items": [
    {
      "numItem": 1,
      "tipoItem": 1,
      "cantidad": 5,
      "codigo": "PROD-002",
      "uniMedida": 59,
      "descripcion": "Repuesto industrial tipo A",
      "precioUni": 50.00,
      "montoDescu": 0.00,
      "ventaGravada": 250.00,
      "ventaExenta": 0.00,
      "ventaNoSuj": 0.00
    }
  ],
  "pagos": [
    {
      "codigo": "07",
      "montoPago": 282.50,
      "referencia": "TRF-2026-04-001"
    }
  ],
  "reteRenta": 0,
  "numPagoElectronico": "TRF-2026-04-001"
}
```

### Descripción de Campos — Objeto `receptor` (Obligatorio para CCF)

| Campo | Tipo | Req. | Descripción |
| :--- | :--- | :--- | :--- |
| `nit` | `string` | **Requerido** | NIT del receptor: exactamente **14 dígitos**. Se remueven guiones automáticamente. |
| `nrc` | `string` | **Requerido** | NRC del receptor: 1 a 8 dígitos. Se remueve guión automáticamente. |
| `nombre` | `string` | **Requerido** | Razón social del receptor. Máx 250 chars. |
| `nombreComercial` | `string` | Opcional | Nombre comercial. Máx 250 chars. |
| `codActividad` | `string` | **Requerido** | Código de actividad económica CIIU. Ej: `"47190"`. Máx 6 chars. |
| `descActividad` | `string` | **Requerido** | Descripción de la actividad. Máx 150 chars. |
| `direccionDepartamento` | `string` | **Requerido** | Código del departamento (2 chars). Ver [Catálogo de departamentos](#catálogo-departamentos). |
| `direccionMunicipio` | `string` | **Requerido** | Código del municipio (2-4 chars). Ver [Catálogo de municipios](#catálogo-municipios). |
| `direccionComplemento` | `string` | **Requerido** | Dirección física completa. Máx 200 chars. |
| `telefono` | `string` | Opcional | Teléfono del receptor. Máx 30 chars. |
| `correo` | `string` | Opcional | Email de confirmación. Máx 100 chars. |
| `esGranContribuyente` | `boolean` | Opcional | `true` si el receptor es Gran Contribuyente. Activa retención del 1% de IVA automáticamente. Default `false`. |

> [!IMPORTANT]
> En el CCF, el campo `precioUni` del ítem **NO incluye IVA** (es precio neto). iFactu calcula y suma el 13% de IVA en el resumen. En la CF sí va con IVA incluido.

---

## 4. Respuesta Estándar de Hacienda

Cuando el DTE es procesado correctamente por Hacienda, la respuesta es:

```json
{
  "success": true,
  "dte": {
    "codigoGeneracion": "966B2F1F-3A7C-4B2D-8E1F-A02B3C4D5E6F",
    "numeroControl": "DTE-01-0001P001-000000000000001",
    "selloRecepcion": "20260427141523-DTE-01-...",
    "fechaEmision": "2026-04-27",
    "horaEmision": "14:15:23",
    "totalPagar": 34.00,
    "montoLetras": "TREINTA Y CUATRO 00/100 DOLARES",
    "qrUrl": "https://pwa.mh.gob.sv/consultadte/query?codGen=966B2F1F-...&fecEmi=2026-04-27&ambiente=00",
    "estado": "RECIBIDO"
  }
}
```

### Descripción de Campos de Respuesta

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `codigoGeneracion` | `string (UUID)` | Identificador único del DTE generado por Nexa/iFactu. Usar para el QR y para futuras consultas. |
| `numeroControl` | `string` | Número de control oficial del MH. Imprimir en el ticket. |
| `selloRecepcion` | `string \| null` | Sello otorgado por Hacienda. `null` si está en CONTINGENCIA. Imprimir en ticket si existe. |
| `fechaEmision` | `string` | Fecha en formato `YYYY-MM-DD`. |
| `horaEmision` | `string` | Hora en formato `HH:mm:ss`. |
| `totalPagar` | `number` | Monto total a pagar (numérico). |
| `montoLetras` | `string` | Monto en letras legibles para el ticket. |
| `qrUrl` | `string` | URL del portal del MH para validar el DTE. Generar QR con este valor. |
| `estado` | `string` | Ver tabla de estados abajo. |

### Estados Posibles del DTE

| Estado | Significado | Acción en Nexa |
| :--- | :--- | :--- |
| `RECIBIDO` | ✅ Hacienda aceptó el DTE. | Imprimir ticket, mostrar sello. |
| `PENDIENTE` | ⏳ Aún no procesado (raro). | Esperar o consultar de nuevo. |
| `RECHAZADO` | ❌ Hacienda rechazó el DTE por error en los datos. | Revisar `observaciones` en el log. Requiere corrección manual. |
| `CONTINGENCIA` | ⚠️ Hacienda no disponible. DTE guardado para envío posterior. | Informar al cliente, el DTE es válido internamente y se enviará al recuperarse la conexión. |
| `ANULADO` | 🚫 DTE invalidado exitosamente. | Eliminar del historial activo. |

---

## 5. Anular / Invalidar un DTE

Permite anular una factura o CCF que ya fue aceptado por Hacienda.

> [!WARNING]
> Solo se pueden anular DTEs en estado `RECIBIDO`. La anulación es irreversible. Hacienda exige que se realice el mismo día de emisión (antes de las 23:59 horas de El Salvador).

### Endpoint
```
POST /api/pos/dte/:id/anular
```

Donde `:id` es el **UUID interno del DTE** (el campo `id` que deberías guardar en Nexa al momento de crear el DTE).

> [!NOTE]
> Para obtener el `id` interno del DTE, debes guardar el UUID que iFactu devuelve en la base de datos de Nexa al momento de crear el DTE. Este ID es diferente al `codigoGeneracion`.

### Payload Completo
```json
{
  "tipoAnulacion": 1,
  "motivoAnulacion": "Error en precio del producto, se reemite con el monto correcto",
  "nombreResponsable": "Juan Pérez Martínez",
  "tipDocResponsable": "13",
  "numDocResponsable": "012345678",
  "nombreSolicita": "María García López",
  "tipDocSolicita": "13",
  "numDocSolicita": "098765432"
}
```

### Descripción de Campos

| Campo | Tipo | Req. | Descripción |
| :--- | :--- | :--- | :--- |
| `tipoAnulacion` | `number` | **Requerido** | `1` = Error en datos del documento, `2` = Rescindir operación, `3` = Otro |
| `motivoAnulacion` | `string` | **Requerido** | Descripción del motivo de anulación. Debe ser específico y claro. |
| `nombreResponsable` | `string` | **Requerido** | Nombre del empleado que autoriza la anulación. |
| `tipDocResponsable` | `string` | **Requerido** | Tipo de documento del responsable: `"13"` = DUI, `"36"` = NIT |
| `numDocResponsable` | `string` | **Requerido** | Número de documento del responsable (sin guiones). |
| `nombreSolicita` | `string` | **Requerido** | Nombre de quien solicita la anulación (puede ser el mismo o el cliente). |
| `tipDocSolicita` | `string` | **Requerido** | Tipo de documento de quien solicita. |
| `numDocSolicita` | `string` | **Requerido** | Número de documento de quien solicita. |

### Respuesta de Anulación Exitosa
```json
{
  "success": true,
  "dte": {
    "codigoGeneracion": "966B2F1F-...",
    "numeroControl": "DTE-01-...",
    "selloRecepcion": null,
    "fechaEmision": "2026-04-27",
    "horaEmision": "14:15:23",
    "totalPagar": 34.00,
    "montoLetras": "TREINTA Y CUATRO 00/100 DOLARES",
    "qrUrl": "...",
    "estado": "ANULADO"
  }
}
```

---

## 6. Manejo de Errores

### Códigos HTTP de Respuesta

| Código | Significado | Causa Común |
| :--- | :--- | :--- |
| `201 Created` | ✅ DTE emitido correctamente. | Flujo exitoso. |
| `400 Bad Request` | ❌ Error de validación. | Campo faltante, formato incorrecto, NIT/NRC inválido. |
| `401 Unauthorized` | 🔒 No autorizado. | `X-API-Key` ausente, incorrecta o el comercio está inactivo. |
| `404 Not Found` | 🔍 DTE no encontrado. | El `:id` proporcionado para anulación no existe o no pertenece al comercio. |
| `422 Unprocessable` | ⚠️ Error lógico. | El DTE ya fue anulado, o no cumple las condiciones para anularse. |
| `500 Internal Server Error` | 💥 Error del servidor. | Error del firmador Docker o rechazo técnico de Hacienda. |

### Estructura de Error
```json
{
  "statusCode": 400,
  "message": [
    "nit debe tener exactamente 14 dígitos numéricos",
    "condicionOperacion must be a valid enum value"
  ],
  "error": "Bad Request"
}
```

> [!TIP]
> El campo `message` puede ser un `string` o un `string[]`. Nexa debe manejar ambos casos y mostrar los mensajes al operador en el panel.

---

## 7. Catálogos Oficiales de Referencia

### Catálogo Unidades de Medida (CAT-014)

Las más usadas en comercio local:

| Código | Descripción |
| :--- | :--- |
| `59` | Unidad |
| `31` | Kilogramo |
| `32` | Libra |
| `53` | Metro |
| `58` | Servicio |
| `22` | Litro |
| `44` | Pie cuadrado |

### Catálogo Departamentos

| Código | Nombre |
| :--- | :--- |
| `01` | Ahuachapán |
| `02` | Sonsonate |
| `03` | Santa Ana |
| `04` | Chalatenango |
| `05` | La Libertad |
| `06` | San Salvador |
| `07` | Cuscatlán |
| `08` | La Paz |
| `09` | Cabañas |
| `10` | San Vicente |
| `11` | Usulután |
| `12` | San Miguel |
| `13` | Morazán |
| `14` | La Unión |

### Métodos de Pago

| Código | Descripción |
| :--- | :--- |
| `01` | Efectivo |
| `02` | Tarjeta de Débito |
| `03` | Tarjeta de Crédito |
| `07` | Transferencia / Depósito |
| `99` | Otro |

### Tipos de Ítem

| Código | Descripción |
| :--- | :--- |
| `1` | Bien (producto físico) |
| `2` | Servicio |
| `3` | Ambos (bien + servicio) |
| `4` | Otros cargos |

---

## 8. Flujo Completo de una Venta (Diagrama)

```
[Nexa POS - Cajero]
        │
        │ 1. Cajero completa la venta y cierra el ticket
        ▼
[Backend Nexa]
        │
        │ 2. POST /api/pos/cf (o /ccf)
        │    Headers: { X-API-Key: "nx_live_..." }
        │    Body: { items, pagos, receptor, ... }
        ▼
[iFactu Backend]
        │
        │ 3. Valida la API Key → Identifica empresa → Asigna correlativo
        │ 4. Construye JSON según esquema MH v3
        │ 5. Firma el documento (Docker Firmador)
        │ 6. Transmite a Hacienda (dtes.mh.gob.sv)
        ▼
[Ministerio de Hacienda]
        │
        │ 7. Valida el DTE firmado
        │ 8. Devuelve sello de recepción
        ▼
[iFactu Backend]
        │
        │ 9. Guarda el DTE en la BD con estado RECIBIDO
        │ 10. Devuelve respuesta a Nexa
        ▼
[Backend Nexa]
        │
        │ 11. Guarda sello y número de control en la venta
        │ 12. Genera ticket para imprimir
        ▼
[Nexa POS - Ticket Impreso]
        │
        ├── Número de Control
        ├── Código de Generación (UUID)
        ├── Sello de Recepción MH
        ├── QR Code → qrUrl
        └── Monto en Letras

═══════════════════════════════
  Si iFactu no puede conectar
  con Hacienda (contingencia):
═══════════════════════════════

[iFactu Backend]
        │
        │ 9b. Guarda el DTE con estado CONTINGENCIA
        │ 10b. Devuelve respuesta con estado="CONTINGENCIA"
        ▼
[Backend Nexa]
        │
        │ 11b. Informa al cajero que el DTE está en contingencia
        │      El DTE es válido, se enviará automáticamente
        │      cuando Hacienda se recupere.
        └── Ticket sin sello pero con número de control
```

---

## 9. Checklist de Producción

Antes de pasar la integración a ambiente de producción (`MH_AMBIENTE=01`), verificar:

- [ ] **URL Base actualizada** a la URL real del dominio de iFactu en producción.
- [ ] **API Key de producción** configurada en Nexa (`IFACTU_API_KEY`).
- [ ] **Certificado digital real** (.p12) del MH instalado en iFactu.
- [ ] **Guardar el `id` interno** del DTE en Nexa para poder anularlo si es necesario.
- [ ] **Probar emisión de CF** con un producto real en ambiente `01`.
- [ ] **Probar emisión de CCF** con datos fiscales reales de un proveedor.
- [ ] **Probar flujo de anulación** completo antes de exponer a cajeros.
- [ ] **Implementar manejo de estado `CONTINGENCIA`** en Nexa: mostrar aviso al cajero y ticket sin sello.
- [ ] **Tiempo de espera (timeout)**: Configurar al menos 30 segundos de timeout en Nexa para las llamadas a iFactu, ya que la firma y transmisión a Hacienda puede tardar.

---

## Recursos Adicionales

| Recurso | URL |
| :--- | :--- |
| Portal DTE Pruebas | https://test7.mh.gob.sv/ssc/consulta/fe/ |
| Portal DTE Producción | https://portaldgii.mh.gob.sv/ssc/consulta/fe/ |
| Manual Técnico MH | https://transparencia.mh.gob.sv/downloads/pdf/700-DGII-MN-2023-002.pdf |
| Consulta QR (Pruebas) | `https://pwa.mh.gob.sv/consultadte/query?codGen={UUID}&fecEmi={YYYY-MM-DD}&ambiente=00` |
| Consulta QR (Producción) | `https://pwa.mh.gob.sv/consultadte/query?codGen={UUID}&fecEmi={YYYY-MM-DD}&ambiente=01` |
