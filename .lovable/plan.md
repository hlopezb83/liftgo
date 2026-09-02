# Ronda 3 — Verificación: sí son bugs reales

Revisé los 9 hallazgos contra el código actual (v7.419.0). **Los 9 se confirman**: cada uno apunta a una línea que existe hoy y hace lo que el documento describe. Ninguno es falso positivo.

## Qué encontré (verificado archivo por archivo)

| # | Hallazgo | Confirmado | Impacto real |
|---|---|---|---|
| 1 | `prepare_payment_complement`: rama de REP cancelado idéntica al `ELSE` | Sí (migración 20260902030728, líneas 59-75) | Alto — re-timbrar un REP cancelado puede ser rechazado |
| 2 | `register_supplier_payment` hereda el lote más reciente | Sí (migración 20260902030956) | Medio — un abono manual bloquea cancelar el lote |
| 3 | Detector de extras en la Edge Function recurrente sólo mira el pivote | Sí | Medio — doble cobro u omisión de seguro/logística |
| 4 | REP descompone IVA con la tasa de encabezado | Sí (`stamp-payment-complement`, línea ~211) | Alto — IVA ficticio en facturas exentas o mixtas |
| 5 | Editar cliente no guarda `tax_rate` | Sí (`useCustomerDetailActions.ts`, campo ausente del UPDATE) | Alto — cambio silenciosamente perdido |
| 6 | REP cancelado que falla tras el claim queda en 409 permanente | Sí | Medio — pago sin posibilidad de REP sin tocar la BD |
| 7 | Cotización en divisa acepta TC = 1 | Sí (`quoteFormSchema.ts`, `tipoCambio > 0`) | Medio — paridad ficticia que contamina reservas |
| 8 | Preview recurrente acepta TC = 1 | Sí (`generate-recurring-invoices`, `> 0`) | Bajo — falla tarde con error crudo |
| 9 | CSV de facturas sin Moneda ni Tipo de cambio | Sí (`InvoicesPage.tsx` `exportCsv`) | Bajo — sumas que mezclan MXN y USD |

Analogía: la ronda 2 fue como reparar la instalación eléctrica de la casa; la ronda 3 son los cables que quedaron mal conectados en tres contactos (FIX-1 a FIX-3) y seis fallas nuevas que salieron al probar los focos.

## ¿Vale la pena corregir?

Sí, y en este orden:

**Bloque A — Fiscal / dinero (obligatorio)**
- FIX-4: IVA del REP por línea (`objeto_imp` / `tax_rate` de cada partida) en vez de la tasa de encabezado.
- FIX-1: nueva migración con `CREATE OR REPLACE prepare_payment_complement`, la rama de REP cancelado devuelve `0`.
- FIX-5: incluir `tax_rate` en el UPDATE de cliente, unificando con `buildCustomerPayload`.

**Bloque B — Atascos operativos**
- FIX-6: capturar el estado pre-claim y restaurarlo (limpiar `rep_cfdi_uuid` cuando corresponde) en las tres salidas de error.
- FIX-2: `p_batch_id` explícito en `register_supplier_payment` (nueva migración) + `batchId` opcional en `useRegisterSupplierPayment`.
- FIX-3: portar `hasNonRentalLines` a `_shared/nonRentalLines.ts` y revisar también `invoices.booking_id`.

**Bloque C — Consistencia FX y export (rápidos)**
- FIX-7 y FIX-8: aplicar la regla canónica `fx_is_missing` (TC nulo, ≤ 0 o = 1 en divisa) en el schema de cotización y en `buildPlan`.
- FIX-9: agregar columnas Moneda y Tipo de cambio al CSV.

## Reglas que se respetan

- Ninguna migración existente se edita; todo va en migraciones nuevas con timestamp posterior a `20260902030956`.
- Sin cambios a RLS, state machines, guards RPC ni permisos: sólo se corrigen cálculos y se agrega un parámetro opcional.
- Dinero con `@/lib/money` / `_shared/money.ts`; conversión de moneda con el criterio canónico de `sync_invoice_status`.
- IVA siempre vía `resolveVatRatePercent`.
- Tests: casos nuevos para TC=1 en cotización, `tax_rate` en edición de cliente, helper de extras y escenario SQL de `prior_balance`.
- Changelog: entrada nueva al inicio (minor, v7.420.0).

## Alternativa si quieres acotar

Puedo aplicar sólo el Bloque A (los tres de mayor riesgo fiscal) y dejar B y C para una segunda entrega.
