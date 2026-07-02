# Validación de visibilidad: PAC, CFDI, Acuse y REP

## Diagnóstico

Hoy la visibilidad de estos bloques es inconsistente:

- **PAC (Sandbox)**: sólo se pinta si la factura NO está timbrada (`cfdiStatus !== "stamped"`) y el ambiente actual es test. Consecuencia: una factura timbrada en Sandbox se ve idéntica a una de Producción → riesgo de confundir un CFDI de pruebas con uno real.
- **CFDI PDF/XML**: el botón PDF siempre se renderiza (draft = "PDF borrador"); el XML sólo si `isStamped`. Correcto, pero no explícito.
- **Acuse PDF/XML**: sólo aparece con `cancellation_status === "accepted"`. Correcto, pero no cubre el caso en el que la factura llega cancelada sin acuse aún sincronizado.
- **REP**: la columna aparece sólo si la factura padre es PPD timbrada. Por pago, se muestran descargas si `rep_cfdi_status === "stamped"` y "Timbrar REP" si `none/error`. Falta ocultar la columna cuando la factura está cancelada (los REP dejan de tener sentido operativo) y evitar mostrar acciones REP en pagos sin conciliación real.

Además, no hay una regla única documentada; cada bloque decide por su cuenta.

## Objetivo

Definir una **matriz de visibilidad** basada en el estado fiscal de la factura y aplicarla de forma consistente en `InvoiceDetail`, `InvoiceDetailActions`, `InvoiceDetailBadges` y `usePaymentHistoryColumns`.

## Matriz de visibilidad

Ejes:
- **Estado interno**: `draft | sent | partial | paid | overdue | cancelled`
- **CFDI**: `pending | stamped | cancelled | error`
- **Cancelación**: `none | pending | accepted | rejected`
- **Ambiente del CFDI** (por factura): `test | live` — se lee desde la propia factura al momento del timbrado, no del toggle actual de la empresa.

| Situación                         | PDF borrador | CFDI PDF | CFDI XML | Acuse PDF/XML | REP col./acciones | Chip Sandbox    |
| --------------------------------- | :----------: | :------: | :------: | :-----------: | :---------------: | :-------------: |
| Borrador (pending, no error)      |      ✅       |    ❌     |    ❌     |       ❌       |         ❌         | sólo si test¹   |
| Timbrado en error                 |      ✅       |    ❌     |    ❌     |       ❌       |         ❌         | sólo si test¹   |
| Timbrada (PUE)                    |      ❌       |    ✅     |    ✅     |       ❌       |         ❌         | si env=test     |
| Timbrada (PPD)                    |      ❌       |    ✅     |    ✅     |       ❌       |         ✅         | si env=test     |
| Cancelación en proceso (pending)  |      ❌       |    ✅     |    ✅     |       ❌       |     ✅ solo lectura²      | si env=test     |
| Cancelada + acuse aceptado        |      ❌       |    ✅     |    ✅     |       ✅       |     ✅ solo lectura²      | si env=test     |
| Cancelada sin acuse (edge)        |      ❌       |    ✅     |    ✅     | ❌ + hint sync |     ✅ solo lectura²      | si env=test     |
| Cancelación rechazada             |      ❌       |    ✅     |    ✅     |       ❌       |         ✅         | si env=test     |

¹ En borrador el ambiente del CFDI aún no existe; el chip Sandbox se calcula con el toggle actual de la empresa como heads-up.
² "Solo lectura" en REP = ocultar botones "Timbrar REP" y "Cancelar REP"; mantener descargas de REPs ya timbrados (los complementos ya sellados siguen siendo documentos fiscales válidos).

## Cambios técnicos

### 1. Estado fiscal persistido por factura

Necesitamos saber en qué ambiente se timbró cada factura, no depender del toggle actual:

- Migración: `ALTER TABLE public.invoices ADD COLUMN facturapi_env text CHECK (facturapi_env IN ('test','live'))`.
- `stamp-cfdi`: al timbrar, escribir `facturapi_env` con el modo actual del PAC.
- Backfill: `UPDATE invoices SET facturapi_env = 'live' WHERE cfdi_status IN ('stamped','cancelled') AND facturapi_env IS NULL` (o `'test'` según lo que tenga sentido para el histórico; validar con el usuario si hay dudas).

### 2. Helper único de visibilidad

Crear `src/features/invoices/lib/invoiceVisibility.ts`:

```ts
export type InvoiceVisibility = {
  showDraftPdf: boolean;
  showCfdiPdf: boolean;
  showCfdiXml: boolean;
  showAcuseButtons: boolean;
  showAcuseSyncHint: boolean;   // cancelada sin acuse aún
  showRepColumn: boolean;
  allowRepMutations: boolean;   // habilita Timbrar/Cancelar REP
  showSandboxChip: boolean;
};

export function computeInvoiceVisibility(invoice, company): InvoiceVisibility { … }
```

Consume esta función `InvoiceDetail` una sola vez y la pasa a hijos por props.

### 3. Aplicación en UI

- `InvoiceDetailBadges`: reemplaza el par `showPacBadge/isLive` por `showSandboxChip`.
- `InvoicePDFButton`: recibe `mode: "draft" | "cfdi" | "hidden"` en vez de decidir con `cfdiStatus`.
- `InvoiceDetailActions`: usa `showCfdiXml`, `showAcuseButtons`, `showAcuseSyncHint` para renderizar bloques (el hint es un `Badge` outline "Cancelada · sincronizando acuse" + botón "Actualizar estado SAT" que ya existe).
- `InvoicePaymentSummary` / `usePaymentHistoryColumns`: recibe `showRepColumn` y `allowRepMutations`. Cuando `allowRepMutations` es false, ocultar botones "Timbrar REP" y "Cancelar REP" pero mantener descargas.

### 4. Changelog

Nueva entrada `v6.104.11` (patch, improvement):
- Reglas unificadas de visibilidad de PAC/CFDI/Acuse/REP.
- Nuevo campo `facturapi_env` por factura; el chip Sandbox ahora es fiel al ambiente en que se emitió el CFDI.
- REP en facturas canceladas: se conservan descargas de REPs ya timbrados; se ocultan acciones de timbrado/cancelación.

## Fuera de alcance

- Rediseño de los botones (ya se hizo en v6.104.9).
- Cambios en Edge Functions de descarga (`get-cfdi-file` sigue igual; sólo `stamp-cfdi` escribe `facturapi_env`).
- Cambios de lógica de negocio de cancelación o de timbrado.
