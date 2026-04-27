# Guía de Integración Nexa -> iFactu DTE

Esta guía detalla los protocolos técnicos para que el sistema **Nexa** transmita factas y reciba las variables de Hacienda procesadas por **iFactu**.

## 1. Seguridad y Autenticación

Todas las peticiones deben realizarse vía **HTTPS** e incluir la cabecera de API Key que identifica al comercio.

| Cabecera | Valor | Descripción |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | |
| `X-API-Key` | `nx_live_...` | Llave única del comercio generada en iFactu. |

## 2. Puntos de Enlace (Endpoints)

Base URL: `https://tu-dominio-ifactu.com/api/pos`

| Acción | Método | Endpoint | Descripción |
| :--- | :--- | :--- | :--- |
| **Factura (CF)** | `POST` | `/cf` | Emite Factura Consumidor Final (01). |
| **Crédito Fiscal (CCF)** | `POST` | `/ccf` | Emite Comprobante de Crédito Fiscal (03). |
| **Anulación** | `POST` | `/dte/:id/anular` | Invalida un DTE emitido hoy (antes de 24h). |

## 3. Estructura de la Petición (Payload)

### Factura Consumidor Final (CF)
```json
{
  "codEstable": "0001", // Opcional, por defecto usa el principal
  "codPuntoVenta": "P001",
  "condicionOperacion": 1, // 1=Contado, 2=Crédito
  "items": [
    {
      "tipoItem": 1, // 1=Bien, 2=Servicio
      "cantidad": 1,
      "uniMedida": 59, // 59=Unidad, consultar catálogo para otros
      "descripcion": "Camiseta Algodón L",
      "precioUni": 15.00, // Precio con IVA incluido
      "montoDescu": 0.00,
      "ventaGravada": 15.00,
      "ventaExenta": 0.00,
      "ventaNoSuj": 0.00
    }
  ],
  "pagos": [
    {
      "codigo": "01", // 01=Efectivo, 02=Tarjeta, 03=Transferencia
      "montoPago": 15.00
    }
  ],
  "receptor": {
    "nombre": "CLIENTE FINAL", // Opcional si es < $200
    "correo": "cliente@email.com" // iFactu enviará el PDF/JSON automáticamente
  }
}
```

### Comprobante de Crédito Fiscal (CCF)
Requiere datos fiscales del receptor.
```json
{
  "codEstable": "0001",
  "codPuntoVenta": "P001",
  "condicionOperacion": 1,
  "items": [...],
  "pagos": [...],
  "receptor": {
    "nit": "00000000000000",
    "nrc": "000000",
    "nombre": "EMPRESA CLIENTE S.A.",
    "codActividad": "62020",
    "descActividad": "Desarrollo de Software",
    "direccionDepartamento": "06", // San Salvador
    "direccionMunicipio": "14", // San Salvador
    "direccionComplemento": "Avenida Jerusalén #123"
  }
}
```

### Anulación de Documento
Para anular una venta (debe ser el mismo día de emisión):
`POST /api/pos/dte/ID_DEL_DTE/anular`
```json
{
  "motivo": "01", // 01=Error de digitación, 02=Devolución, etc.
  "nombreResponsable": "Cajero Juan Perez",
  "numDocResponsable": "00000000-0"
}
```

## 4. Respuesta Técnica (Response)

Si la transmisión a Hacienda es exitosa (`201 Created`), se devuelve:

```json
{
  "success": true,
  "dte": {
    "codigoGeneracion": "966B2F1F-...",
    "numeroControl": "DTE-01-...",
    "selloRecepcion": "202404...",
    "fechaEmision": "2024-04-20",
    "horaEmision": "14:23:01",
    "totalPagar": 15.00,
    "montoLetras": "QUINCE 00/100 DOLARES",
    "qrUrl": "https://pwa.mh.gob.sv/consultadte/query?...",
    "estado": "RECIBIDO"
  }
}
```

## 5. Manejo de Errores

| Código | Significado | Acción Nexa |
| :--- | :--- | :--- |
| `401` | Unauthorized | Revisar que la `X-API-Key` sea la correcta. |
| `400` | Bad Request | El JSON está mal formado o faltan campos obligatorios. |
| `500` | Error de Hacienda | El validador de Hacienda rechazó la firma o los datos fiscales. |

---

> [!IMPORTANT]
> **Multisucursal y Multipunto:** iFactu valida que el `codEstable` enviado exista en la configuración del comercio. Si Nexa no lo envía, el sistema intentará procesarlo con la sucursal matriz por defecto.
