## Objetivo

Que toda factura nueva nazca con los `receptor_*` y `uso_cfdi` ya copiados desde el cliente (snapshot inmutable, alineado a CFDI 4.0). Las facturas existentes se quedan como están.

## Estado actual

- **Creación manual** (`useInvoiceFormHandlers.handleCustomerSelect` / `handleBookingSelect`): ya hidrata vía `cfdiFromCustomer`. ✅
- **Desde cotización** (`buildFromQuote`): ya hidrata. ✅
- **Defaults de CFDI** en `EMPTY_CFDI`: `formaPago='03'`, `metodoPago='PUE'`, `usoCfdi='G03'`. ✅
- **Facturación recurrente** (edge `generate-recurring-invoices`): **NO hidrata** datos fiscales del cliente. ❌ — este es el origen de FAC-0071.

## Cambios

### 1. Edge `supabase/functions/generate-recurring-invoices/index.ts`

Antes del `insert` en `invoices`:

- Cargar el cliente: `select rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi from customers where id = booking.customer_id`.
- Agregar al payload del insert:
  - `receptor_rfc`, `receptor_razon_social` (con fallback a `name`), `receptor_regimen_fiscal`, `receptor_domicilio_fiscal_cp`, `uso_cfdi` — solo si el cliente los trae.
  - Defaults SAT: `forma_pago: "99"` (Por definir, típico de PPD recurrente), `metodo_pago: "PPD"` (renta mensual con pago posterior), `moneda: "MXN"`, `tipo_cambio: 1`.
- Si el cliente no existe o le falta RFC: continuar creando la factura pero loguear un `warn` (no bloquear el cron). El precheck del front seguirá bloqueando el timbrado hasta que se complete.

### 2. Revertir el fallback de hidratación en `handleStamp`

`src/features/invoices/hooks/invoiceDetail/useInvoiceDetailActions.ts`:

- Quitar el bloque agregado ayer que consulta `customers` y hace `update` al vuelo antes de timbrar.
- Volver a la validación simple: si faltan campos → toast "Faltan datos para timbrar. Completa en el cliente o en la factura".
- Razón: con el snapshot al crear, ya no es necesario; mantener dos fuentes de verdad confunde y oculta datos faltantes del cliente.

### 3. Sin backfill ni migración

Las facturas viejas (FAC-0071 y previas) se quedan en `draft`. Si el usuario las quiere timbrar, edita la factura → al guardar pasa por el form y se rehidratan, o las cancela.

### 4. Changelog `v6.16.3` (patch)

- "Datos fiscales del receptor se copian desde el cliente al generar facturas recurrentes (snapshot CFDI 4.0)."
- "Removido fallback de hidratación en timbrado; el snapshot ocurre al crear la factura."

## Verificación

- Test manual: ejecutar `generate-recurring-invoices` (o esperar al cron) y verificar que la nueva factura nace con `receptor_rfc`, `receptor_razon_social`, etc. poblados.
- `vitest run` para asegurar que nada se rompe en los flujos de creación.

## Notas técnicas

- El precheck `getMissingStampFields` se mantiene tal cual — actúa como guardia tanto para facturas viejas como para clientes incompletos.
- No se toca el schema de DB; los campos `receptor_*` ya existen en `invoices`.
