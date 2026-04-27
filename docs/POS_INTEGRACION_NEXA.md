# Integración POS (Nexa) ↔ iFactu API

Contrato para implementar en el cliente Nexa que emite DTE vía iFactu.

## Base URL

- **API iFactu (Nest):** en desarrollo suele ser `http://localhost:3002/api` (puerto por defecto del repo para no chocar con **Nexa u otros en :3000**). Ajusta host/puerto según tu `PORT` y despliegue.
- Todas las rutas de este documento van **debajo de** `/api`.

## Autenticación

| Cabecera     | Obligatorio | Descripción |
|-------------|-------------|-------------|
| `X-API-Key` | Sí          | API key interna del comercio. Se genera en iFactu: **Configuración → Integración NEXA → Generar API key**. |
| `Content-Type` | Sí     | `application/json` |

No uses `Authorization: Bearer` en los endpoints `/pos/*`; identifica solo la empresa la API key.

## Códigos MH en cada factura

En **cada** `POST` de emisión debes enviar:

| Campo JSON          | Tipo   | Obligatorio | Descripción |
|---------------------|--------|-------------|-------------|
| `codEstable`        | string | Recomendado | Código de **establecimiento** MH (4 caracteres, ej. `M001`, `0001`). Si omites, iFactu usa el de «Identificadores fiscales». |
| `codPuntoVenta`     | string | Recomendado | Código de **punto de venta** MH (ej. `P001`). Si omites, iFactu usa el de «Identificadores fiscales». |

**Reglas que valida iFactu**

1. **Establecimiento matriz** (mismo código que en Identificadores fiscales de la empresa): el `codPuntoVenta` debe ser **exactamente** el configurado ahí (ej. `P001`). No inventes otro PV para matriz.
2. **Otra sucursal** registrada en iFactu (tabla Sucursales): debes enviar el par `(codEstable, codPuntoVenta)` que coincida con:
   - un **punto de venta** dado de alta en Configuración para esa sucursal, **o**
   - mientras no haya ningún punto de venta registrado para esa sucursal, solo se permite el **mismo** `codPuntoVenta` que el de matriz (comportamiento transitorio; conviene registrar los PV en iFactu).

Si el par no es válido, la API responde **400** con mensaje descriptivo en español.

## Endpoints

### `POST /cf` (alias Nexa)

Misma semántica que `/pos/cf`. Algunos clientes llaman `POST /api/cf` en lugar de `POST /api/pos/cf`; ambas rutas están soportadas.

### `POST /pos/cf`

Emite **Factura Consumidor Final** (tipo DTE 01).

- Cabeceras: `X-API-Key`, `Content-Type: application/json`
- Cuerpo: `CreateCfDto` (items, receptor opcional, pagos, etc.) + opcionales `codEstable`, `codPuntoVenta` en la raíz del JSON.

Ejemplo mínimo (estructura; los campos internos deben cumplir validaciones del DTO):

```http
POST /api/pos/cf
X-API-Key: <tu_api_key>
Content-Type: application/json
```

```json
{
  "codEstable": "M001",
  "codPuntoVenta": "P001",
  "condicionOperacion": 1,
  "items": [
    {
      "numItem": 1,
      "tipoItem": 1,
      "cantidad": 1,
      "uniMedida": 59,
      "descripcion": "Producto demo",
      "precioUni": 11.3,
      "montoDescu": 0,
      "ventaNoSuj": 0,
      "ventaExenta": 0,
      "ventaGravada": 11.3
    }
  ],
  "pagos": [{ "codigo": "01", "montoPago": 11.3 }]
}
```

### `POST /pos/ccf`

Emite **Comprobante de Crédito Fiscal** (tipo 03). Misma idea: `codEstable` y `codPuntoVenta` en la raíz si el POS opera por establecimiento/punto de venta.

### `POST /pos/dte/:id/anular`

Permite anular desde Nexa un DTE ya emitido.

- Cabeceras: `X-API-Key`, `Content-Type: application/json`
- `:id` = UUID interno del DTE en iFactu
- Solo anula DTE en estado `RECIBIDO`
- El DTE debe pertenecer a la empresa asociada a la API key

Ejemplo:

```http
POST /api/pos/dte/ffb427ca-a4b7-4781-aad7-b97ea4fd4046/anular
X-API-Key: <tu_api_key>
Content-Type: application/json
```

```json
{
  "tipoAnulacion": 2,
  "motivoAnulacion": "Rescindir operación",
  "nombreResponsable": "Juan Perez",
  "tipDocResponsable": "13",
  "numDocResponsable": "01234567-8",
  "nombreSolicita": "Juan Perez",
  "tipDocSolicita": "13",
  "numDocSolicita": "01234567-8"
}
```

## Respuestas

- **200**: cuerpo incluye `success: true` y datos del DTE/ticket según implementación actual.
- **400**: validación (códigos MH, DTO, etc.) — mostrar el mensaje al usuario.
- **401**: API key faltante o inválida.

## Qué configurar antes en iFactu

1. Identificadores fiscales (establecimiento + punto de venta matriz).
2. Si hay más locales: **Sucursales** + **Puntos de venta** por sucursal (mismos códigos que usará Nexa).
3. Generar y copiar la **API key** Nexa.

## Cómo reportarnos incidencias en Nexa

Incluye siempre:

- `X-API-Key` usada (solo últimos 4 caracteres en tickets públicos).
- URL base del API (sin contraseñas).
- Cuerpo JSON **completo** enviado (sin datos personales si aplica).
- Código HTTP y cuerpo de error devuelto por iFactu.
- NIT / ambiente (pruebas vs producción) si aplica.
