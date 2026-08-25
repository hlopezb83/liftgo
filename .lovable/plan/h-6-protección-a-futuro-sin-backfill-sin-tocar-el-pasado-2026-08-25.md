# H-6 — Protección a futuro (sin backfill, sin tocar el pasado)

## Resumen

El candado original de H-6 (índice único "una factura manual por reserva") es incorrecto: bloquearía la facturación mensual legítima. El candado correcto ya existe (`uniq_invoices_recurring_period`), pero las facturas manuales llegan sin `billing_period_start`, así que lo esquivan.

**Decisión del usuario:** no hacer backfill ni cancelar duplicados históricos. Solo proteger el futuro: que ninguna factura nueva vinculada a una reserva se cree sin periodo, de modo que el índice existente atrape los duplicados de aquí en adelante.

Analogía: no arreglamos las facturas viejas que entraron "sin etiqueta de mes"; de hoy en adelante, el torniquete exige etiqueta a toda factura con reserva, así el detector de "dos facturas del mismo mes" vuelve a funcionar.

## Fase 1 — Candado en base de datos (forward-only, abuela los históricos)

Un trigger `BEFORE INSERT OR UPDATE` que **no valida filas existentes** (no hay backfill) y **abuela** las facturas históricas sin periodo:

- **Exime** a roles de backend confiables (`postgres`, `service_role`): los RPC `SECURITY DEFINER` (`create_recurring_invoice`, `e2e_seed_*`) y los seeds e2e no se rompen. El `create_recurring_invoice` ya manda periodo de todos modos.
- **INSERT (rol authenticated):** bloquea si `booking_id IS NOT NULL AND billing_period_start IS NULL`. Este es el vector real (la UI creaba facturas manuales con reserva sin mes).
- **UPDATE (rol authenticated):** bloquea solo si la fila *pasa a estar* en violación (se asigna `booking_id` nuevo sin periodo, o se borra el periodo de una factura con reserva). Las facturas históricas sin periodo pueden editarse libremente (cambiar status, notas, marcar pagada) porque no son una transición *hacia* la violación.

Esto deja intactos los 13 casos históricos: siguen sin periodo, pero ya nadie puede crear uno nuevo así, ni desetiquetar los que sí traen periodo.

Herramienta: `supabase--migration`. Función `plpgsql` con `SET search_path = public` (no necesita `SECURITY DEFINER` ni `has_role`: no toca otras tablas, solo inspecciona `NEW`/`OLD`).

## Fase 2 — UI: exigir periodo al facturar una reserva

- `src/features/invoices/lib/invoiceFormSchema.ts`: hacer `billing_period_start` requerido (Zod condicional) cuando hay `bookingId`/`bookingIds`.
- `src/features/invoices/hooks/invoiceForm/useInvoiceFormSubmit.ts` (`buildPayload`): incluir `billing_period_start` y `billing_period_end` en el payload (hoy no se envían).
- `src/features/invoices/pages/InvoiceForm.tsx`: mostrar un selector de periodo (mes-año, o reusar `DatePickerMx` para inicio/fin) cuando se selecciona reserva; pre-llenar con el mes de la fecha de emisión.
- `src/features/invoices/hooks/useExtensionPrefill.ts`: al prellenar desde una extensión, setear `billing_period_start`/`end` con el rango de la extensión (no el mes de emisión), para que "Facturar extensión" cumpla la regla.
- No tocar archivos autogenerados.

## Fase 3 — Verificación

- `bun run lint` y `tsgo` sin errores.
- `bunx vitest run` (suite de invoices).
- Smoke SQL: `SELECT count(*) FROM invoices WHERE booking_id IS NOT NULL AND billing_period_start IS NULL AND status <> 'cancelled'` — ya no será 0 (no hacemos backfill); lo que verificamos es que **no aumente** y que el trigger bloquea inserts nuevos (test de inserción que debe fallar con el mensaje del trigger).
- Confirmar que seeds e2e y `create_recurring_invoice` siguen funcionando (eximidos por rol).
- Actualizar `public/changelog.json`, `public/version.json`, `CHANGELOG.md` y `public/changelog/v7.x.x.json` (versión minor: cambio estructural + UI).

## Reglas del proyecto respetadas

- No se crean tablas (no aplica GRANT/policy).
- Trigger de validación (no `CHECK`), porque la regla no es inmutable: depende del rol y de la transición OLD→NEW.
- No se tocan archivos autogenerados ni schemas prohibidos.
- No se modifica ni cancela dato histórico alguno.
- Localización mexicana; changelog en español.

## Riesgo residual (aceptado)

Las facturas históricas sin periodo siguen sin deduplicarse contra facturas nuevas del mismo mes. Es decir: una factura nueva con periodo "Marzo 2026" no chocará contra una histórica de Marzo sin etiqueta. El usuario aceptó este residuo al elegir no tocar el pasado. El candado elimina el vector de *creación* de nuevos duplicados, que era la causa real.
