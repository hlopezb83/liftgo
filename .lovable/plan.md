
# Validación diffs arquitectura + plan de ejecución

Verifiqué cada diff crítico contra el código real antes de proponer trabajo. Abajo el veredicto por cada uno y el lote propuesto.

## Validación

### Críticos (1–5) — reales, aplicar YA

- **DIFF 1 · Cron recurrente en repo** — REAL PARCIAL. `rg cron.schedule` no encuentra ningún schedule para `generate-recurring-invoices` en `supabase/migrations/`. `generate-recurring-maintenance` sí tiene schedule (20260721021751). En `config.toml` no hay overrides `verify_jwt=false` para ninguna de las dos, así que hoy el cron no puede invocarlas con service key sin JWT de usuario. Aplicar tal cual el diff pero con dos cuidados: (a) `generate-recurring-invoices` hoy NO tiene guarda de bearer server-side — hay que añadirla ANTES de bajar `verify_jwt`, o queda pública; (b) usar el mismo patrón de Vault que ya usa `20260721021751`, no `current_setting('app.service_role_key')`.
- **DIFF 2 · Eliminar `syncInvoiceStatus` cliente** — REAL. El trigger `sync_invoice_status_from_payments_trg` (mig 20260718062234) hace exactamente lo mismo: `SELECT ... FOR UPDATE`, misma guarda `cancelled|draft`, mismas transiciones paid/partial/sent, mismo `paid_at`. El cliente sólo repite la lógica sin transacción → puede pisar el resultado del trigger o generar races entre dos sesiones. Borrar cliente + tests, mantener trigger.
- **DIFF 3 · `fetchWithTimeout` compartido** — REAL. `cancel-cfdi`, `cancel-credit-note`, `cancel-payment-complement`, `download-cfdi`, `refresh-cancellation-status` usan `fetch(` directo contra Facturapi sin `AbortController`. `_shared/facturapi/` ya existe como carpeta pero no expone helper de timeout. Extraer el patrón probado en `stamp-cfdi/handler.ts`.
- **DIFF 4 · `billing_secrets` sin SELECT directo** — REAL. Mig 20260515235356 crea policy "Admins select billing_secrets" con acceso completo — cualquier admin desde el navegador puede leer la live key. Ya existe RPC `get_billing_secrets_status` (visible en types). Falta: quitar policy SELECT, mover writes a RPC, quitar lectura del cliente.
- **DIFF 5 · Allowlist del persister** — REAL. Mismatches confirmados: `inventory` ≠ key real `parts_inventory`; `contract-templates` ≠ `contract_templates`; `cash-flow-settings` ≠ `cash_flow_settings`; blocklist `user_roles` no coincide con root real `user_role` (grep). El fix del diff (allowlist correcta + test) evita que sigamos rompiendo la cache al renombrar.

### Altos (6–10) — reales, agendar en lote siguiente

- **DIFF 6** ciclos: confirmé imports desde `@/features/invoices` a `@/features/portal` y desde `useInvoiceFormHandlers` a `@/features/quotes/utils/nonRentalLines`. Refactor grande — separar en su propio sprint.
- **DIFF 7** `src/lib/rules/invoices.ts` y `src/lib/rules/quotes.ts` viven bajo `src/lib` importando features — real. `src/lib/pdf/*` requiere revisión archivo por archivo.
- **DIFF 8** Duplicación de auth en edge functions — real, pero se debe hacer junto con la creación de `requireServiceOrRole`/`cronAuth` como un solo PR para no dejar mezclado.
- **DIFF 9** invalidaciones muertas `["forklift-options"]` y keys ad-hoc — reales (ya verificados en auditorías previas). `company_settings` tiene 5 lectores en 3 namespaces (`src/lib/pdf/*`, `features/cash-flow`, `features/company-settings`) — real.
- **DIFF 10** `RentalFinancialSummary` recomputa IVA inline y `CollectionForecast` usa `balance_mxn ?? balance` sin normalizar por `tipo_cambio` — reales. `rentalDays + 1` en 5 archivos — real.

### Medios/bajos (11–18)

Todos revisados de alto nivel; son mejoras válidas pero no bloqueantes. Se agendan después de los altos.

## Plan de ejecución

### Lote A — Críticos (esta entrega)
1. **DIFF 5** (menor riesgo, pura cache): corregir allowlist/blocklist del persister a las keys reales + test que valide contra los factories exportados.
2. **DIFF 2**: borrar `syncInvoiceStatus.ts` + sus dos importers en `usePayments.ts` + test dependiente; verificar con vitest que el flujo de pagos sigue verde apoyándose en el trigger.
3. **DIFF 3**: crear `supabase/functions/_shared/facturapi/withTimeout.ts` y sustituir `fetch(` por `fetchWithTimeout(` en las 5 edge functions listadas, con mensaje "PAC no respondió en 30s".
4. **DIFF 4**: migración que DROP la policy SELECT de `billing_secrets`, crear `upsert_billing_secret(key,value)` con guard admin, y refactor de `useBillingSecrets` para consumir el RPC + status (sin leer valores).
5. **DIFF 1**: (a) añadir guarda `Bearer service_role|CRON_SECRET` server-side a `generate-recurring-invoices` (patrón `process-cfdi-retry-queue`); (b) migración con `cron.schedule` para invoices (`15 6 * * *`) y maintenance (`30 6 * * *`) usando el patrón Vault ya presente en `20260721021751`; (c) `config.toml`: `verify_jwt=false` para ambas funciones sólo DESPUÉS de (a).

### Lote B (siguiente) — Altos 6–10
Refactor de ciclos, `src/lib` sin `@/features`, auth compartida en edge functions, keys canónicas y reglas de negocio fuera de la UI. Se propondrá como plan aparte.

### Lote C — Medios/bajos 11–18
RPCs transaccionales de delete, consolidación de migraciones, `select("*")` sensibles, guardrails ESLint en error, tests de superficie crítica, realtime acotado, limpieza cosmética. Plan separado.

## Verificaciones al terminar Lote A
- `bun test` verde (incluye tests que sobreviven a borrar `syncInvoiceStatus`).
- `bun run build` verde.
- Manual: registrar un pago desde UI → status factura correcto (via trigger).
- Manual: intentar leer `billing_secrets.value` como admin desde el navegador → denegado.
- SQL: `SELECT jobname FROM cron.job` incluye `generate-recurring-invoices-daily` y `generate-recurring-maintenance-daily`.
- Bump changelog v7.204.0 con detalle por diff aplicado.

## Notas técnicas
- No mezclar Lote A con los pendientes de R12 (M1, M2, M4, M6, M7, M9, M10, A2) — cerrar A primero.
- Riesgo bajo en 2/3/5, riesgo medio en 4 (cambia contrato de `useBillingSecrets`), riesgo medio en 1 (activar cron requiere guard server-side previo).
