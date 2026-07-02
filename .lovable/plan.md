## Diagnóstico

La factura FAC-0076 sí está timbrada (tiene `cfdi_uuid` y `facturapi_invoice_id`), pero las columnas `serie` y `folio` están en `NULL` en la base de datos. Por eso el card "Identificadores" muestra "— pendiente de timbrado —" en la fila de Serie y Folio.

Causa raíz: la Edge Function `stamp-cfdi` no persiste los campos `series` y `folio_number` que devuelve Facturapi al timbrar; solo guarda `cfdi_uuid` y `facturapi_invoice_id`.

## Cambios

### 1. `supabase/functions/stamp-cfdi/index.ts`
Al recibir la respuesta de Facturapi, incluir `series` y `folio_number` en el `UPDATE` de `invoices`, mapeándolos a las columnas `serie` y `folio`.

### 2. Backfill de facturas ya timbradas
Nueva Edge Function puntual (o RPC administrativa) `backfill-facturapi-serie-folio` que:
- Selecciona todas las `invoices` con `facturapi_invoice_id IS NOT NULL` y (`serie IS NULL` OR `folio IS NULL`).
- Consulta cada factura vía `GET /invoices/:id` a Facturapi.
- Actualiza `serie` y `folio` en Postgres.
- Se ejecuta una vez y se puede volver a llamar de forma idempotente.

Se ejecutará contra el ambiente activo para reparar FAC-0076 y cualquier otra factura afectada.

### 3. `InvoiceDetailIdentifiers.tsx`
Ajustar el placeholder de la fila "Serie y Folio" para que sea semántico según el estado:
- Si la factura está timbrada (`cfdi_uuid` presente) pero no hay serie/folio: mostrar "— no informado por el PAC —" en lugar de "— pendiente de timbrado —".
- Si no está timbrada: mantener "— pendiente de timbrado —".

Para lograrlo, el componente recibirá `isStamped: boolean` y pasará un `placeholder` dinámico a la fila de Serie/Folio.

### 4. Tests
Actualizar `InvoiceDetailIdentifiers.test.tsx` para cubrir los dos placeholders (timbrada sin serie/folio vs. borrador).

### 5. Changelog
Entrada `v6.106.3` — "Persistir Serie y Folio de Facturapi al timbrar + backfill retroactivo".

## Notas técnicas

- La respuesta de Facturapi expone `series` (string) y `folio_number` (number). Guardamos `folio` como texto para consistencia con el tipo actual de la columna.
- El backfill usa `fetch` directo a `https://www.facturapi.io/v2/invoices/:id` con el API key del ambiente correspondiente (`facturapi_env` de la factura) para evitar mezclar sandbox/producción.
