## Opción C — Aislamiento reforzado de E2E (mismo proyecto)

Resuelve los dos riesgos que detectaste (folios fiscales y timbrado CFDI) sin necesidad de un segundo proyecto Supabase.

## 1. Folios fiscales — series E2E separadas

Los tests dejarán de consumir folios reales. Se introduce una serie paralela con prefijo distinto:

- `next_quote_number_e2e()` → `E2E-COT-0001`, `E2E-COT-0002`, …
- `next_booking_number_e2e()` → `E2E-RSV-0001`, …
- `next_invoice_number_e2e()` → `E2E-FAC-0001`, …

Las funciones reales (`next_quote_number`, etc.) se modifican para **excluir `is_e2e = true`** del cálculo del `MAX`, de modo que aunque un test cree un registro fuera del helper, los folios reales nunca se vean afectados.

`e2e_seed_scenario` cambia para llamar las versiones `_e2e`.

**Resultado:** la serie fiscal queda intacta, sin huecos. Visualmente además es obvio qué es E2E (`E2E-FAC-…`).

## 2. CFDI / Facturapi — bloqueo en frontera

Añadir un guard en la edge function `stamp-cfdi` (y `cancel-cfdi`):

```ts
if (invoice.is_e2e === true) {
  return new Response(JSON.stringify({ error: "E2E invoices cannot be stamped" }), { status: 403, ... });
}
```

Además, una constraint a nivel DB:

```sql
ALTER TABLE invoices ADD CONSTRAINT invoices_e2e_no_cfdi
  CHECK (NOT (is_e2e = true AND cfdi_uuid IS NOT NULL));
```

**Resultado:** imposible timbrar un CFDI E2E ni accidentalmente ni con un bug; la DB rechaza el registro.

## 3. Endurecer el helper de seed

- `e2e_seed_scenario(p_scope)` deja de aceptar `p_scope = NULL` (elimina el modo legacy). El fixture ya pasa scope; el modo NULL solo es deuda peligrosa.
- `e2e_teardown(p_scope)` igual: requiere scope. El modo "borrar todo lo `is_e2e`" se mantiene únicamente como RPC admin separado `e2e_purge_all()` para limpieza manual de emergencia.
- Constraint: `CHECK (NOT (is_e2e = true AND e2e_scope IS NULL))` en las 7 tablas, para garantizar que cada fila E2E sea rastreable y borrable.

## 4. Filtrar `is_e2e` en listados principales

Replicar lo que ya hicimos en `useAuditLogs` en los hooks de lista de los módulos visibles para usuarios:

- `useForklifts`, `useCustomers`, `useQuotes`, `useBookings`, `useInvoices`, `usePayments`, `useEquipmentModels`

Cada uno añade `.eq("is_e2e", false).or("is_e2e.is.null")` por defecto. Así, aunque un test corra mientras un usuario real está navegando la app, **nunca verá registros E2E** en sus listados, KPIs, ni reportes.

## 5. Defensa "no correr E2E contra producción real"

Añadir flag en `company_settings`: `allow_e2e_seed boolean default true`. El RPC `e2e_seed_scenario` verifica al inicio:

```sql
IF NOT (SELECT allow_e2e_seed FROM company_settings LIMIT 1) THEN
  RAISE EXCEPTION 'E2E seeding disabled on this environment';
END IF;
```

Cuando este proyecto pase a producción real con clientes, basta con un `UPDATE company_settings SET allow_e2e_seed = false` para bloquear todo el sistema de seed sin tocar código.

## Archivos / cambios

**Migración SQL nueva** que incluye:
- Las 3 funciones `next_*_number_e2e`
- Modificación de las 3 `next_*_number` reales para excluir `is_e2e`
- Constraint CFDI en `invoices`
- Constraint `e2e_scope NOT NULL` en las 7 tablas
- `e2e_seed_scenario` y `e2e_teardown` requieren scope
- Nuevo `e2e_purge_all()` para limpieza manual
- Columna `allow_e2e_seed` en `company_settings` + verificación en seed

**Edge function:** `supabase/functions/stamp-cfdi/index.ts` — añadir guard `is_e2e`. Igualmente `cancel-cfdi` si existe.

**Frontend:** añadir `.eq("is_e2e", false).or("is_e2e.is.null")` (o equivalente) a los 7 hooks de lista. Sin cambios de UI.

**Tests:** ningún cambio funcional, el fixture sigue igual (ya pasa scope).

**Changelog:** v6.42.0 (minor — endurecimiento de aislamiento E2E).

## Lo que NO hace este plan
- No crea un segundo proyecto Supabase (eso sería Opción A).
- No mueve tablas a otro schema.
- No toca el código de aplicación que escribe registros reales (solo lectura/listados).

¿Apruebas?