
# Idempotencia en LiftGo ERP — ¿Es necesaria?

## Respuesta corta

**Sí, pero selectivamente.** No todo el ERP la necesita. Los flujos que tocan dinero, fisco o triggers irreversibles (CFDI, pagos, facturación recurrente) sí. Los flujos UI con un usuario haciendo clic en su pantalla, no — basta con `disabled={isPending}` y constraints de BD.

Hoy el ERP **ya tiene idempotencia parcial** (guards en `stamp-cfdi`, `generate-recurring-invoices`, `payment_in_progress_at` en lotes), pero con **ventanas de race condition** y **dos antipatrones de "numeración + insert"** que pueden producir duplicados silenciosos bajo doble-clic o retry de red.

---

## Qué es idempotencia (en una línea)

Que ejecutar la misma operación 1 vez o N veces produzca exactamente el mismo resultado — sin duplicados, sin efectos secundarios extra.

---

## Matriz costo/beneficio por módulo

| Módulo | Riesgo real hoy | Impacto si pasa | Costo de implementar | ¿Vale la pena? |
|---|---|---|---|---|
| **Timbrado CFDI** (`stamp-cfdi`, `stamp-credit-note`, `stamp-payment-complement`) | Medio — guards existen pero con ventana | **ALTO** — doble timbre ante SAT, cancelación manual + multa | Bajo — `UPDATE ... WHERE status='draft' RETURNING` antes de llamar a Facturapi | **SÍ — P0** |
| **Facturación recurrente** (`generate-recurring-invoices` cron) | Alto — race window entre SELECT y INSERT | **ALTO** — doble factura al cliente, doble timbrado, conciliación rota | Medio — `UNIQUE(customer_id, billing_period_start, billing_period_end)` parcial + advisory lock | **SÍ — P0** |
| **Numeración** (`next_invoice_number`, `next_supplier_bill_number`, etc.) | Alto — `MAX()+1` sin lock; sin UNIQUE constraint | Medio — números repetidos rompen contabilidad y export SAT | Bajo — secuencia atómica dentro de RPC + `UNIQUE` constraint | **SÍ — P0** |
| **Lotes de pago a proveedor** (`create_supplier_payment_batch`) | Medio — `payment_in_progress_at` no bloquea segundo lote | Alto — doble transferencia bancaria | Bajo — `RAISE EXCEPTION` si `payment_in_progress_at IS NOT NULL` | **SÍ — P1** |
| **Mantenimiento recurrente** (`generate-recurring-maintenance`) | Medio — bulk insert sin verificación previa | Bajo-Medio — logs duplicados, ruido operativo | Bajo — actualizar `last_generated_month` ANTES del insert dentro de transacción | **SÍ — P1** |
| **Importación CFDI gastos** (`parse-cfdi-expense`) | Ya idempotente (chequea UUID) | — | — | **YA OK** |
| **Importación bancaria** (`useImportBankStatement`) | Ya idempotente (`upsert` por hash) | — | — | **YA OK** |
| **Mutations UI normales** (crear cliente, prospecto, etc.) | Bajo — botón disabled + UNIQUE en BD | Bajo — error visible, sin daño | Alto si se sobre-ingeniera | **NO — basta lo actual** |

---

## Patrones de implementación recomendados

Tres niveles, del más barato al más caro. Aplicar el mínimo que cubra el riesgo.

### Nivel 1 — Constraints + numeración atómica (BD)

Para todo lo que tenga "número de documento" (facturas, CFDI, lotes, complementos, mantenimientos):

```text
1. UNIQUE constraint en la columna de número.
2. Reemplazar next_*_number (MAX+1) por SEQUENCE de Postgres
   o por un INSERT ... RETURNING que reserve el número dentro
   de la misma transacción del documento.
3. El cliente nunca obtiene el número antes; lo recibe en la respuesta.
```

Cubre: numeración duplicada, doble-clic, retry de red — **sin tocar Edge Functions**.

### Nivel 2 — Idempotency key (Edge Functions críticas)

Para timbrado CFDI, facturación recurrente, lotes de pago:

```text
1. Tabla idempotency_keys(key text PK, response jsonb, created_at,
   expires_at).
2. Cliente envía header Idempotency-Key (UUID generado en el form).
3. Edge Function:
   - SELECT por key; si existe y < 24h → devolver response cacheada
   - INSERT key (UNIQUE falla si concurrente → 409)
   - Ejecutar operación
   - UPDATE response cacheada
```

Cubre: retries automáticos, cron disparado dos veces, doble submit cross-tab.
Estándar de la industria (Stripe, AWS).

### Nivel 3 — Advisory locks / state machine atómica

Para flujos donde el Nivel 2 no basta (timbrado SAT, transferencias):

```text
1. UPDATE invoices SET cfdi_status='stamping'
   WHERE id=? AND cfdi_status='draft' RETURNING *;
2. Si no devolvió fila → otra petición ya está timbrando → 409.
3. Llamar Facturapi.
4. UPDATE a 'stamped' o rollback a 'draft' en finally.
```

Cierra la ventana entre check y acción externa irreversible.

---

## Roadmap propuesto

### P0 — Esta semana (riesgo financiero/fiscal)
1. **UNIQUE constraints** en `invoices.invoice_number`, `supplier_bills.bill_number`, `credit_notes.credit_note_number`, `payments.payment_number`, `contracts.contract_number`, etc.
2. **Refactor `next_*_number` RPCs** para emitir el número dentro del mismo INSERT (eliminar el patrón cliente-pide-número, cliente-inserta).
3. **State guard atómico** en `stamp-cfdi`, `stamp-credit-note`, `stamp-payment-complement` (UPDATE returning antes de llamar a Facturapi).
4. **Advisory lock o UNIQUE parcial** en `generate-recurring-invoices` por `(customer_id, period_start, period_end)` para cerrar la race window del cron.

### P1 — Próximas dos semanas
5. **Bloquear segundo lote** en `create_supplier_payment_batch` cuando `payment_in_progress_at` esté seteado.
6. **Reordenar `generate-recurring-maintenance`**: marcar `last_generated_month` ANTES del bulk insert, ambos dentro de una transacción RPC.

### P2 — Cuando se integre webhooks o terceros entrantes
7. **Tabla `idempotency_keys` + header `Idempotency-Key`** en las 3 Edge Functions críticas (timbrado, recurrente, lotes). Solo se vuelve necesario cuando Facturapi/SAT reintenten webhooks o cuando se exponga API a integradores.

---

## Lo que NO se debe hacer

- No agregar idempotencia a mutations triviales (`createCustomer`, `updateProspect`) — basta con el `UNIQUE` actual y el botón disabled.
- No implementar Nivel 2/3 sin primero cerrar Nivel 1 (los UNIQUE constraints atrapan el 80% de los casos por sí solos).
- No usar `upsert` indiscriminadamente como "solución" — oculta bugs lógicos y rompe auditoría.

---

## Detalles técnicos (referencia)

Antipatrones detectados en el código actual:

- `src/features/invoices/hooks/invoices/useInvoices.ts:42-57` — RPC + insert en dos pasos.
- `src/features/accounts-payable/hooks/useSupplierBillMutations.ts:24-31` — mismo patrón.
- `supabase/functions/generate-recurring-invoices/index.ts:218-270` — SELECT/INSERT con ventana, comentario de "rollback" sin rollback real.
- `supabase/functions/generate-recurring-maintenance/index.ts:73-97` — UPDATE de marca de generación después del INSERT.
- `supabase/functions/stamp-payment-complement/index.ts:62-68` — check sin actualización optimista.
- `supabase/migrations/20260609185156_*.sql:123-160` — `create_supplier_payment_batch` permite incluir factura ya en lote en progreso.

Ya idempotentes (no tocar): `parse-cfdi-expense` (UUID check), `useImportBankStatement` (upsert por hash), `stamp-cfdi` (guard 409 — falta cerrar ventana pero no inserta duplicado en BD).

---

## Recomendación final

**Hacer P0 ya** (es deuda técnica con impacto fiscal real). **P1 cuando haya hueco.** **P2 solo cuando se exponga API a terceros o entren webhooks.** No invertir en idempotencia "global" — el ROI cae a cero fuera de los flujos listados.
