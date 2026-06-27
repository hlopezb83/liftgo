
## Auditoría: ¿qué pone Facturapi y qué debemos capturar?

Revisé `CfdiFieldsCard.tsx`, el schema (`invoiceFormSchema.ts`), el payload (`useInvoiceFormSubmit.ts`) y cómo `stamp-cfdi` arma la petición. Esta es la realidad de cada campo según la API de Facturapi v2:

### Campos que Facturapi resuelve solo — los podemos quitar del modal

| Campo actual | Quién lo pone realmente |
|---|---|
| **Serie** | Casi nadie la usa. Facturapi acepta omitirla y nuestra numeración interna ya es `FAC-XXXX` en `folio`. Saturar el formulario sin utilidad. |
| **Folio** | Ya lo genera el backend al crear la factura (secuencia `FAC-`). Mostrarlo editable invita a errores. Debería ser read-only o no aparecer. |
| **Tipo de cambio** (cuando moneda = MXN) | Facturapi lo fija a 1 automáticamente. Ya lo ocultamos — ✅ correcto. |

### Campos que SÍ son obligatorios y debemos mantener

| Campo | Por qué no se puede auto |
|---|---|
| **Forma de pago** | Lo elige el negocio según cómo cobre (01 efectivo, 03 transferencia, 99 por definir…). Facturapi no infiere. |
| **Método de pago** | PUE vs PPD cambia el flujo de complementos. Decisión de negocio. |
| **Uso CFDI** | Lo define el receptor; no se infiere. Prefilleado desde el cliente, pero editable. |
| **Moneda** | Si es USD/EUR cambia todo. |
| **Tipo de cambio** (cuando ≠ MXN) | Facturapi lo puede tomar del DOF, pero la práctica común es mandarlo explícito para auditoría. Mantener. |

### Datos del receptor — auto-completados pero requeridos por Facturapi

`receptor_rfc`, `receptor_razon_social`, `receptor_regimen_fiscal`, `receptor_domicilio_fiscal_cp` son **obligatorios** en el payload de Facturapi (CFDI40147/148/149 si faltan). Ya se prefilean desde el cliente vía `cfdiFromCustomer`. Recomendación: **colapsarlos en un acordeón "Datos fiscales del receptor"** cerrado por default, mostrando un resumen ("EPR010101AAA · Régimen 601 · CP 06600"). El 95% de las veces no se editan.

### Campos que Facturapi/PAC siempre pone (nunca capturamos, ✅ ya es así)

- Fecha de timbrado, UUID, sello, certificado, número de certificado
- Versión CFDI (4.0), TipoComprobante (I)
- Emisor completo (RFC, razón social, régimen, lugar de expedición) — viene de la organización Facturapi
- Cadena original, sello del SAT

## Cambios propuestos al modal

1. **Quitar** los inputs `Serie` y `Folio` de `CfdiFieldsCard`. El folio se genera en backend al guardar; mostrarlo como badge informativo en modo edición si ya existe.
2. **Colapsar** el bloque "Receptor" (RFC, razón social, régimen, CP) en un `Collapsible` cerrado por default con un summary del receptor seleccionado y un botón "Editar datos fiscales".
3. **Mantener** Forma de pago, Método de pago, Uso CFDI, Moneda y Tipo de cambio (solo cuando ≠ MXN).
4. **Renombrar** la card a "Datos de timbrado CFDI" para reflejar mejor que son decisiones, no metadata.

Resultado visual: la card pasa de 10 inputs a 4 visibles + 1 sección colapsable. Menos ruido, menos errores, mismo poder al timbrar.

## Detalles técnicos

- `invoiceFormSchema.ts`: quitar `serie` y `folio` del `cfdiSchema` (o dejarlos opcionales por compatibilidad y enviarlos `null`).
- `useInvoiceFormSubmit.ts → buildCfdiPayload`: enviar `serie: null, folio: null` para no romper el contrato con la columna `invoices.invoice_number` (que ya se llena por RPC de secuencia).
- `EMPTY_CFDI`: limpiar las claves removidas.
- `CfdiFieldsCard`: usar `Collapsible` de `@/components/ui/collapsible` para el bloque receptor; render summary con los valores actuales.
- Modo edición: si la factura ya tiene `serie`/`folio` (legacy), mostrarlos como texto plano, no input.
- Changelog: nueva entrada `v6.97.0` minor — "Simplificación del modal de factura: ocultados folio/serie autogestionados y agrupados datos fiscales del receptor".
