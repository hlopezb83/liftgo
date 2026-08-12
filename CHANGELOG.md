## 7.306.2 - 2026-08-12

**Infraestructura — `rls-db-tests` arranca desde cero**
- Causa raíz: migraciones de junio revocan `EXECUTE` sobre funciones creadas en julio (`create_notification`, `notify_admins`, …). En la nube existían por otro camino; desde cero fallan con `42883` y tumban `supabase start`.
- `scripts/patch_legacy_migrations.py`: nuevo paso que envuelve cada `GRANT/REVOKE ... ON FUNCTION` en un guard `to_regprocedure(...) IS NOT NULL` (solo en el checkout efímero del runner).
- Sin cambios en `db reset`, `run_sql_suites.py`, la publicación JUnit ni la versión de la CLI.

## 7.306.1 - 2026-08-12

**Arquitectura — `arch-check` verde**
- `scripts/arch-check.sh`: se agrega `stateMachines.ts` al allowlist congelado de `src/lib/domain/`; el archivo es genuinamente cross-domain (invoices, deliveries, contracts) y espejo en TypeScript de los triggers de la base de datos.
- Guardrail G4: se eliminan imports directos de `@/integrations/supabase/client` en UI (`DamageActions.tsx`, `InvoiceForm.tsx`) moviendo la lógica a `useStartRepairWorkOrder` y `useCloseDamageOnInvoice`.
- Guardrail G5: se eliminan 17 cross-feature deep imports creando barrels públicos para `cash-flow` y `reports`, ampliando los de `contracts` y `maintenance`, y reemplazando imports profundos por `@/features/<feature>`.

## 7.306.0 - 2026-08-12

**Configuración — datos fiscales desde la CSF**
- `FiscalDataTab`: nuevo bloque "Importar desde CSF" con `CsfDropzone` (solo Admin).
- Mapea RFC, razón social, régimen fiscal y CP fiscal → lugar de expedición.
- Precarga el formulario (`shouldDirty`); se aplica hasta presionar Guardar.
- Reutiliza la edge function `parse-csf`; sin cambios de base de datos.

## 7.305.1 - 2026-08-12

**Contratos — montos del pagaré**
- `placeholders.ts`: nuevo `buildPagareVars()`; `{deposito}` legado se resuelve al monto del pagaré y la mora cae a 5% cuando el contrato tiene 0.
- `PagareAnnex.tsx`: encabezado y cuerpo usan las mismas variables (ya no discrepan).
- Datos: plantillas de contrato con `pagare_text` legado actualizadas al texto sugerido (monto con letra, ciudad del contrato).
- Tests: casos nuevos en `contractPlaceholders.test.ts`.

## 7.305.0 - 2026-08-12

**Cotizaciones — seguro opcional**
- `LogisticsCard`: nueva casilla "Incluir Seguro" + campo "Monto del Seguro", junto a la de logística.
- `quoteFormSchema`: `includeInsurance` / `insuranceCost` con validación espejo de la logística.
- `useQuoteFormLogic`: partida "Seguro" en el desglose (suma a subtotal/IVA/total) y limpieza al cambiar renta↔venta.
- `useQuotePrefill`: la partida "Seguro" rehidrata casilla y monto en vez de reconstruirse como partida de renta/venta.
- `nonRentalLines`: clave SAT 84131500 para seguros al facturar; 78101800 para el resto.
- Tests: casos nuevos en `quoteFormSchema.test.ts`, `useQuoteFormLogic.test.tsx`, `useQuotePrefill.test.tsx`, `nonRentalLines.test.ts`.

## 7.304.0 - 2026-08-12

**Pagaré — redacción endurecida**
- `DEFAULT_PAGARE` reescrito: lugar y fecha de suscripción en el cuerpo, "por valor recibido", referencia al contrato y equipo garantizado, vencimiento anticipado, intereses moratorios sobre saldo insoluto, renuncia a presentación/protesto/avisos y obligación solidaria del aval.
- La jurisdicción usa `{ciudad}` (antes "Monterrey, Nuevo León" quemado en el texto).
- Nuevo `src/lib/format/numeroALetras.ts` (español MX, apócope legal, centavos `NN/100 M.N.`) + placeholders `{monto_pagare_letra}` y `{contrato}`.
- `ContractTemplateTab`: botón "Restaurar texto sugerido" del pagaré; las plantillas guardadas no se sobrescriben.
- Tests: `numeroALetras.test.ts` y caso que valida que el pagaré por defecto no deje placeholders sin resolver.

## 7.303.0 - 2026-08-11

**Pagaré por el costo de adquisición del equipo**
- El Anexo B (pagaré) deja de emitirse por el depósito en garantía: el campo "Bueno por" y el texto usan ahora `{monto_pagare}` = `forklifts.acquisition_cost` del equipo del contrato.
- `fetchRelatedData` trae `acquisition_cost`; `buildPlaceholderVars` expone `monto_pagare` con fallback a `deposit_amount` cuando el equipo no tiene costo capturado (evita pagarés en $0.00).
- `{monto_pagare}` registrado en `CONTRACT_PLACEHOLDERS` para el editor de plantillas; la cláusula quinta sigue usando `{deposito}`.
- Tests: casos nuevos en `src/test/contractPlaceholders.test.ts` con y sin costo de adquisición.

## 7.302.2 - 2026-08-11

**UI — encabezados de detalle/edición coherentes**
- `FormPageHeader` y `DetailPageHeader`: el regreso pasa a un botón "Volver" con etiqueta en su propio renglón (antes iba en línea con el `<h1>`, duplicando el breadcrumb y desalineando el título).
- `PageContainer`: `wide`, `form` y `narrow` ahora llevan `mx-auto`; en 1600x900 el contenido queda centrado en vez de pegado al borde izquierdo.
- Formularios de contrato, cotización y factura muestran el folio del registro como subtítulo en modo edición.
- `ContractConditionsCard`: `0` deja de tratarse como vacío; "Interés Moratorio 0%" vuelve a mostrarse.

## 7.302.1 - 2026-08-11

**Corrección — datos del contrato que no llegaban al PDF**
- PDF de contrato: el campo `signed_by` ("Firmado por") ahora se imprime en el recuadro de firma de EL ARRENDATARIO y se expone como placeholder `{firmado_por}`.
- `buildPlaceholderVars` dejaba de respetar el valor `0`: un interés moratorio de 0% se imprimía como 5%. Mismo arreglo para `horas_max` y `tarifa_extra`.
- Formulario de contrato: aviso cuando el interés moratorio queda en 0%.

## 7.302.0 - 2026-08-11

**E1 — Verificación final FORCE RLS + USING(true)**
- Nueva suite `supabase/tests/rls/00_invariants.sql` (corre en `rls-db-tests.yml`): falla el CI si aparece una policy `FOR ALL USING (true)` (salvo `TO service_role`), una escritura abierta a `anon`/`PUBLIC`, una tabla sensible sin `FORCE ROW LEVEL SECURITY`, o una tabla con RLS activo y cero policies. Verificado contra el estado actual: 0 hallazgos.
- `scripts/lint-migrations.ts`: la regla de `SET search_path` pasa a ser **por función** (antes bastaba con un `SET search_path` en cualquier parte del archivo) y se prohíbe `CREATE POLICY ... FOR ALL ... USING (true)`. Ambas reglas aplican solo a migraciones con timestamp >= `NEW_RULES_SINCE` (20260812); el historial anterior está congelado y su estado final lo cubre `00_invariants.sql`.

**E2 — Máquinas de estado**
- `src/lib/domain/stateMachines.ts`: espejo en TS de `validate_transition` y `enforce_signed_contract_lock` (migraciones m13–m18 del 10-ago-2026) para invoices, deliveries y contracts, incluyendo bypasses de `payment_sync` y del flujo fiscal, estados iniciales válidos y campos congelados de contratos.
- `src/lib/domain/__tests__/stateMachines.test.ts`: 101 tests sobre el producto cartesiano origen × destino de cada entidad, más los casos de admin/no-admin y terminalidad.

**E3 — Coverage en PR**
- `davelosert/vitest-coverage-report-action@8b15768` (v2.12.2, pineado por SHA) en `tests-merge`, sobre el mismo reporte del artifact `coverage-report`. Se añadieron los reporters `json-summary` y `json` en `vitest.config.ts`. Solo corre en la corrida completa (en modo `--changed` la cobertura parcial sería engañosa).

**E4 — Squash de migraciones**: pendiente. Requiere que E1–E3 estén verdes en GitHub Actions (baseline + `migrations_archive/` + `supabase migration repair` sobre producción no es reversible desde aquí).

## 7.301.0 - 2026-08-11

Fase 5 de la auditoría de CI (`.github/workflows/ci.yml`):

- **Reuso de build**: el job `build` compila con las `VITE_*` y sube `dist/` como artifact (`retention-days: 1`) + cache `ci-dist-<sha>`. El job `e2e` lo descarga y Playwright solo levanta `vite preview` (`E2E_REUSE_BUILD=1` en `playwright.config.ts`); `bundle-size.yml` restaura ese mismo `dist` y solo compila si hay cache miss. Antes se compilaba 4 veces por PR (build, 2 shards e2e, bundle-size); ahora 1.
- **Fin de la triple corrida RLS**: se eliminó el job `rls` (`test:rls`). Los `*.rls.test.ts` corren una sola vez dentro de los shards de Vitest y `scripts/extract-rls-junit.py` reconstruye `reports/rls-junit.xml` desde el JUnit consolidado, conservando el check "RLS results". La validación real contra Postgres sigue viviendo en `rls-db-tests.yml`.
- **Vitest `--changed` en PRs**: nuevo job `changes` decide el modo. PRs = solo tests afectados (`--changed origin/<base> --passWithNoTests`); push a main, cron, `workflow_dispatch` o PRs que tocan `vitest.config.ts` / `src/test/setup.ts` / `package.json` / `bun.lock` = suite completa **con** los umbrales de cobertura (el gate se evalúa donde la medición es válida).
- **`dorny/paths-filter@de90cc6` (v3.0.2, pineado por SHA)**: `e2e` se salta si el diff no toca `src/`, `tests/`, config de build; `edge-functions` se salta si no toca `supabase/functions/`.
- **`deno test --parallel`** en el job `edge-functions`.
- **Cache de pre-bundle de Vite sin `github.job`** en la key (`setup-bun-project`): todos los jobs comparten la misma entrada en vez de empezar en frío cada uno.
- Sin cambios en concurrency groups, pins SHA, `retention-days`, `permissions` ni los gates de coverage/bundle.

## 7.300.2 - 2026-08-11

- Fix CI (`rls-db-tests`): el step "Start Supabase" fallaba con `ERROR: relation "public.collection_reminders_log" does not exist (SQLSTATE 42P01)` al aplicar `20260515044551` desde cero (la tabla se crea en `20260720011916`).
- Nuevo `scripts/patch_legacy_migrations.py`: envuelve las sentencias fuera de orden en `DO $$ IF to_regclass(...) IS NOT NULL ... $$` **solo en el checkout del runner**; las migraciones del repo y de producción quedan intactas.
- El workflow ejecuta el parche antes de `supabase start` y lo incluye en los `paths` que disparan el job.

## 7.300.1 - 2026-08-11

- Fix (DB_PERMISSION_DENIED en /cuentas-por-pagar): la v7.294.0 revoco EXECUTE a `authenticated` en las funciones de folio, pero `set_supplier_bill_number`, `set_delivery_number` y `set_inspection_number` eran triggers sin SECURITY DEFINER y heredaban el rol del usuario.
- Los tres triggers de folio pasan a `SECURITY DEFINER` con `SET search_path = public`.
- `next_supplier_bill_number`, `next_contract_number` y `next_quote_number` (llamadas por RPC desde la app) llevan guard `is_staff()` y recuperan `GRANT EXECUTE` a `authenticated`; sin acceso para `anon` ni portal.
- Nueva suite `supabase/tests/rls/folio_functions.sql` (36 suites en total).

## 7.300.0 - 2026-08-11

- Tests E2E: fuera `auth.spec.ts`, `quote-to-booking.spec.ts`, `booking-to-invoice.spec.ts` y `accounts-payable.spec.ts` (redundantes); sus asserts se movieron a `full-flow.spec.ts` y `smoke-nav.spec.ts`.
- Tests E2E: `fiscal-stamp/cancel/credit-note/rep` se consolidan en `fiscal-actions.spec.ts` (visibilidad y estado de botones fiscales); el comportamiento del PAC lo cubren los `handler_test.ts` de Deno.
- Tests E2E: `global.setup.ts` ahora hace login por API con `supabase.auth.signInWithPassword` y escribe el storageState a disco; storageState cacheado por rol para `roles-matrix.spec.ts`, que ya no usa el form de login.
- Tests E2E: timeouts magicos sustituidos por `TIMEOUTS` de `fixtures/helpers.ts` en toda la suite.

## 7.299.1 - 2026-08-11

- Seguridad: `FORCE ROW LEVEL SECURITY` en billing_secrets, invoices, payments, contracts, customers, supplier_bills, supplier_payments, profiles, user_roles, role_permissions y audit_logs.
- Seguridad: verificado que edge functions (service_role / caller client) y triggers SECURITY DEFINER no dependian del bypass por propiedad de tabla.
- Docs: la migracion incluye el procedimiento de rollback y la consulta de verificacion en `pg_class`.

## 7.299.0 - 2026-08-11

- Tests RLS: nueva suite `maintenance_parts.sql` (anon/cliente bloqueados, auditor read-only, mecanico y admin escriben, service_role bypass).
- Tests RLS: nueva suite `supplier_payment_batches.sql` para lotes de pago y sus partidas; las CLABEs solo las ve admin/administrativo.
- Tests RLS: `parts_inventory.sql` reescrita — la anterior usaba el rol inexistente `mecanico` y la columna `quantity`, por lo que validaba en falso.
- Docs: `supabase/tests/rls/README.md` con las 35 suites.

## 7.298.0 - 2026-08-11

- CI: se elimina la infraestructura de testing visual E2E que nunca se activo (e2e-visual-baselines.yml solo tenia workflow_dispatch y jamas corrio).
- CI: fuera visual-desktop.spec.ts, visual-mobile.spec.ts y el snapshot visual de bank-reconciliation.spec.ts; ~15 tests skipped menos por shard.
- CI: fuera el script test:e2e:update-snapshots, la opcion updateSnapshots/E2E_UPDATE_SNAPSHOTS y la variable E2E_VISUAL de ci.yml.
- Docs: tests/e2e/README.md sin la seccion de snapshots visuales.

## 7.297.2 - 2026-08-11

- CI: dependabot.yml pasa el frontend del ecosistema `npm` al `bun` para que regenere `bun.lock`; asi `bun install --frozen-lockfile` deja de fallar en changelog-check y bundle-size.
- CI: `commit-message: { prefix: chore, include: scope }` en ambos ecosistemas — titulos `chore(deps): bump ...` que pasan el lint de Conventional Commits.
- CI: `if: github.actor != 'dependabot[bot]'` en el job de pr-title.yml y en `version-sync` de changelog-check.yml (red de seguridad).
- Sin cambios en los gates de PRs humanos.

## 7.297.1 - 2026-08-11

- CI: `.github/workflows/rls-db-tests.yml` fallaba siempre en el step de arranque; la lista `-x` incluia `pgbouncer`, contenedor inexistente en la CLI 2.34.0 (reemplazado por `supavisor`).
- CI: exclusiones corregidas a nombres validos de 2.34.0; se conserva `gotrue` porque las suites RLS necesitan el schema `auth`.
- CI: el step ahora usa `set -euxo pipefail`, `--debug`, `timeout-minutes: 15` y `continue-on-error: false` explicito.
- CI: nuevo step `if: failure()` con `docker ps -a`, `supabase status` y logs de los contenedores `supabase_*`.
- Sin cambios en `db reset`, `scripts/run_sql_suites.py`, publicacion JUnit ni triggers/paths.

## 7.297.0 - 2026-08-11

- Perf (RLS): 234 policies del schema `public` recreadas con `(select auth.uid())` en vez de `auth.uid()` — la funcion STABLE pasa de evaluarse por fila a un InitPlan unico por query (evidencia EXPLAIN antes/despues en el comentario de la migracion, sobre `public.invoices`).
- Perf (RLS): nuevas funciones helper STABLE `is_admin_or_administrativo`, `is_admin_administrativo_auditor`, `is_ops_staff`, `is_backoffice` e `is_staff`; consolidan las OR-chains de `has_role` en un solo `EXISTS` sobre `user_roles`. 29 policies las usan.
- Sin cambio de semantica: mismos `TO`, mismos comandos, misma logica booleana. Las policies `TO public` conservan `has_role` inline porque los helpers solo tienen EXECUTE para `authenticated`/`service_role` (nunca `anon`).
- La migracion incluye una verificacion final que aborta si queda alguna policy con `auth.uid()` sin envolver. Estado verificado: 247 policies, 0 pendientes.

## 7.296.0 - 2026-08-11

- Tests: 12 suites RLS SQL nuevas en `supabase/tests/rls/` — bookings, deliveries, maintenance_logs, status_logs, activity_feed, collection_notes, collection_reminders_log, booking_extensions, quotes (back-office), contract_templates, rate_limits y storage.objects (bucket `documents`).
- Cada suite cubre anon, cliente del portal, staff según `role_permissions` y service_role donde aplica; todas terminan en `ROLLBACK;`.
- Fix: `quotes_portal.sql` usaba `customers.portal_user_id`, columna inexistente; ahora usa `customers.user_id` (convención desactualizada, no un bug de policy).
- Docs: `supabase/tests/rls/README.md` actualizado con las 33 suites y la convención de cambio de rol (`RESET ROLE`).

## 7.295.0 - 2026-08-11

- CI: nuevo workflow `.github/workflows/rls-db-tests.yml` (job `rls-db-tests`) — Fase 2 de supabase/tests/rls/README.md.
- CI: `supabase start` + `supabase db reset` aplican todas las migraciones desde cero y validan su orden.
- CI: las 21 suites RLS SQL corren con roles/JWT reales; resultados JUnit vía .github/actions/publish-test-results.
- CI: smoke SQL (c1_c2, r2, r3, r4, r9, r10) en modo informativo; se salta en PRs de forks y solo corre con cambios en supabase/** o src/**.
- Herramientas: `scripts/run_sql_suites.py` ejecuta suites SQL y emite JUnit.

## 7.294.0 - 2026-08-11

- Seguridad (Tema 1): company_settings con FORCE ROW LEVEL SECURITY, policies normalizadas a TO authenticated y (select auth.uid()).
- Seguridad (Tema 2): policy de storage.objects para clientes del portal usa coincidencia exacta de ruta ('documents/' || name) en vez de LIKE por sufijo.
- Seguridad (Tema 4): guards has_role en assert_invoice_cancellable, peek_next_invoice_number, assign_stamped_invoice_number/rep_number/credit_note_number, claim_maintenance_policy_month, damage_restore_forklift_status, has_active_rental y get_available_forklifts; REVOKE a anon/PUBLIC.

## 7.293.0 - 2026-08-11

- Seguridad: revocado EXECUTE a anon en todas las funciones SECURITY DEFINER salvo accept/reject_quote_from_portal y get_public_branding.
- Seguridad: get_portal_collection_account exige sesión; claim_payment_rep_stamping exige admin/administrativo o service_role.
- Funciones de folios, notificaciones y limpieza reservadas a service_role.

## 7.286.2 - 2026-08-10

- Seguridad: report_profit_by_model exige permiso Reportes/read.
- Pruebas: supabase/tests/r2_smoke.sql y tests de useInviteUser.

## 7.286.1 - 2026-08-10

- Entregas: se permite reprogramar una recolección pendiente cuando la reserva ya está completada (FIX-R2-11).
- Datos: backfills H7(b)/H8(b) verificados sin filas pendientes.

# Changelog

## 7.274.2 — 01/08/2026

Remediación del run de CI `83268379122` (2 jobs rojos) + hallazgo de seguridad.

- **E2E** `daterange-picker.spec.ts`: el filtro `hasText: /^\s*5\s*$/` podía apuntar a un día deshabilitado o fuera del mes visible, así que el clic no seleccionaba nada y `getByText(/selecciona fin/i)` no aparecía. Ahora se usan sólo `button:not([disabled])` y se afirma el estado (`aria-selected`) en lugar del texto de la etiqueta viva.
- **Knip**: eliminados exports sin uso — `useNextQuoteNumber`, `toMtyYMD`, `parseMtyDate` y el tipo `QuoteFormReturn`.
- **Seguridad (SUPA_security_definer_view)**: `public.v_overdue_invoices` era la única vista pública sin `security_invoker`, por lo que leía `invoices` con los privilegios del owner y saltaba RLS. Migración: `ALTER VIEW ... SET (security_invoker = on)`.



## 7.274.1 — 01/08/2026

Hallazgos de la verificación visual de R10 (Playwright con sesión).

- **R10-FE-02b** `DateRangePickerField`: el rango pedía **3 clics**. El guard de "reiniciar rango" (R6-FE-11c) se disparaba con `from == to`, que es el primer clic de react-day-picker. Lógica extraída a `nextRangeState()` / `isPartialRange()` (exportadas y con pruebas unitarias).
- **R10-FE-03b** `useQuotePrefill`: `rentalRateField()` deriva la periodicidad de la descripción legacy — una partida "— Renta mensual" de $20,000 caía en **Tarifa Diaria** y se multiplicaba por los días del periodo (COT-0002: `$640,000` → `$20,666`).
- Verificación en navegador: `/quotes/new` aplica el rango en 2 clics sin errores JS; `/quotes/:id/edit` (COT-0002, COT-0003) precarga cantidad y tarifa correctas.
- Nota: en partidas legacy donde `quantity` representaba meses (COT-0003) no hay metadato para distinguirlo de unidades; el usuario debe revisar la cantidad al reeditar.



## 7.274.0 — 01/08/2026

Auditoría R10: 4 bloqueantes + 2 P2 con diff.

- **R10-FE-01 (P0)** `RentalLineRow` / `SaleLineRow`: guard `if (!v) return` en `onValueChange` — el `BubbleSelect` de Radix emitía `""` al hidratar el form y corrompía las líneas precargadas.
- **R10-FE-03 (P1)** `useQuotePrefill.lineToRentalLineFallback`: lee `qty ?? quantity` y ya no sintetiza `dailyRate` desde `total` (total fantasma de $434,000 en COT-0001).
- **R10-DB-01 (P1 seguridad)** `expire_stale_quotes`: `REVOKE` de `anon`/`authenticated` + guard `auth.role() = 'service_role'`.
- **R10-FE-02 (P1)** `DateRangePickerField`: `from == to` es selección parcial (no auto-aplica); vuelve el botón **Aplicar** (habilitado con rango completo).
- **R10-FE-04 (P2)** `InviteUserDialog`: `inFlightRef` contra doble submit.
- **R10-DB-02**: no aplica — la línea `v_starts_today := p_start_date <= CURRENT_DATE` vive en `create_booking`, no en `start_repair_work_order`, y ya usa `today_mty()` desde R9. Verificado en `supabase/tests/r10_smoke.sql`.
- Verificación: `tsgo --noEmit` limpio, tests de cotizaciones en verde (+3 nuevos), E2E `daterange-picker.spec.ts` actualizado.



## 7.273.5 — 01/08/2026

Refactor de complejidad ciclomática: 0 warnings `complexity` (umbral 15), sin cambios de comportamiento.

- `DamageActions.tsx` (26 → <15): permisos en `useDamagePermissions` + `damageArchiveBlockReason`; UI en `DamageActionButtons` / `DamageBlockReasons`.
- `DeliveryDetail.tsx` (18 → <15): tarjetas en `DeliveryDetailBody`; regla de borrado en `canDeleteDeliveryFor()`.
- `useDashboardSections.ts` (16 → <15): helpers puros `dashboardAccess()` y `mergeFleetCounts()`.
- `PortalDashboard.tsx` (17 → <15): KPIs derivados en `derivePortalKpis()` (`features/portal/lib/portalKpis.ts`).
- Verificación: `eslint` 0 errores / 0 warnings de complejidad, `tsgo --noEmit` limpio, 1467 tests en verde.



## 7.273.4 — 01/08/2026

Calidad de código: `bun run lint` en verde.

- `supplierBillColumns.approval.test.tsx`: el hook se llama dentro de un componente `ApprovalCell` (error `react-hooks/rules-of-hooks`).
- `FormActions.tsx`: `useCallback` para los timers; se eliminan los `eslint-disable` que bloqueaban el React Compiler.
- `useQuotePrefill.ts`: caché por `quoteId` como estado derivado en render (adiós `react-hooks/refs`).
- `AuthGuard.tsx`: reset de `timedOut` como estado derivado en vez de `setState` en efecto.
- `import-x/order` autofix y `eslint-disable` justificados en los specs de Playwright.

## 7.273.3 — 01/08/2026

Estabilidad del selector de rango de fechas.

- `DateRangePickerField`: `DialogContent` pasa de `max-w-fit` a ancho fijo (`w-fit min-w-[22rem]`) y la etiqueta viva tiene alto fijo. Evita el reflow/re-centrado del diálogo al elegir la fecha inicial.
- `tests/e2e/daterange-picker.spec.ts`: helper `clickDay()` que espera visibilidad y fuerza el clic; elimina el fallo intermitente "element is not stable / detached" en CI.

## 7.273.2 — 01/08/2026

Auditoría Ronda 9 · Cierre: cobertura de pruebas.

- E2E `tests/e2e/quote-edit-prefill.spec.ts`: recorre lista → detalle → editar y verifica que los valores precargados sobreviven la ventana de ~1.5 s en la que el `reset()` tardío los borraba (condición NO-GO del documento R9).
- `supabase/tests/r9_smoke.sql`: valida `today_mty()`, ausencia de `CURRENT_DATE` en funciones de negocio, `v_overdue_invoices` sobre `today_mty()`, `quotes.rejected_at` poblado y CxP sin aprobación huérfana. Ejecutado contra el entorno: 5/5 OK.
- Nuevas pruebas unitarias (40): `deriveForkliftDisplayStatus`, `buildLabel` (bitácora), `resolveDeliveryForkliftName`, columna de aprobación de CxP, esquema de sobrepago del portal, `useQuote` con `maybeSingle()`, `setStatus` con `rejected_at` y gate de `ProspectHistoryCard`.
- E2E de `DateRangePickerField`: confirma auto-aplicación al completar el rango y ausencia del botón "Aplicar".
- Bitácora: `actorLabel()` distingue "Sistema" (sin `actor_id`) de un usuario no identificado (`Usuario <id corto>`).
- Refactor de apoyo: se extrajeron `deriveForkliftDisplayStatus` y `resolveDeliveryForkliftName` desde las páginas para poder probarlos sin montarlas.

## 7.273.1 — 01/08/2026

Auditoría Ronda 9 · Fase 2: los 7 detalles P2.

- Cotizaciones: `rejected_at` al rechazar; detalle con `maybeSingle()` (fin del 406 tras borrar).
- CxP: la columna de aprobación deja de mostrar "Por aprobar" en facturas pagadas o canceladas.
- Portal: el sobrepago indica el saldo pendiente exacto y el botón permanece habilitado para dar retroalimentación.
- Bitácora: nombres y roles legibles en lugar de identificadores hexadecimales.
- Entregas: el nombre del montacargas se toma del join de la consulta, con el mapa de flota como respaldo.
- Filtros: `DateRangePickerField` se aplica solo al completar el rango.


## 7.273.0 — 01/08/2026

Auditoría Ronda 9 (pre-release): cierre de los 6 bloqueantes.

- Cotizaciones (P0): hidratación reactiva del formulario (`values` de RHF) en lugar de `reset()` one-shot — se acabó la pérdida de partidas al navegar lista → detalle → editar. Fallback para cotizaciones legacy sin `rental_meta`.
- Base de datos: nueva función `today_mty()` como única fuente de "hoy"; se reemplazó `CURRENT_DATE` (UTC) en indicadores, `v_overdue_invoices`, alertas, contadores y validaciones.
- Frontend: defaults de fecha en zona horaria de Monterrey (devoluciones, entregas, mantenimiento, CxP, vigencia de cotización).
- CRM: `ProspectHistoryCard` permite el rol Ventas sin exponer el módulo Auditoría.
- Flota: badge del detalle derivado con `computeFleetAvailability`.
- Formularios: guard anti doble submit robusto (liberación con debounce + timeout de seguridad, ahora en `onClick`).
- Rutas: `/customers/new` redirige al alta por diálogo; identificadores no-UUID muestran "no encontrado".

## 7.272.0 — 31/07/2026

Auditoría Ronda 8: permisos restaurados, cierre de OT blindado y detalles de interfaz.

- Base de datos: se recrearon las reglas de lectura perdidas (Mecánico: reservas y extensiones; Ventas: historial de prospectos, acotado a prospectos), se agregó el candado en el servidor que impide cerrar órdenes de trabajo con daños abiertos y un diagnóstico de coherencia de cuentas por pagar.
- Interfaz: tab "Vencido" alineado con el Panel, datos financieros de unidad sólo para roles autorizados, botón "Cerrar OT" bloqueado con daño abierto, edición de cotizaciones sin perder partidas, motivo obligatorio al rechazar cotización, duración cotizada inclusiva, KPIs de cuentas por pagar corregidos, fechas del portal y de inspección en zona horaria de Monterrey, traducciones en bitácora/conciliación/pagos, mejor contraste y objetivos táctiles de 44px.

## 7.261.0 — 29/07/2026

- Cotizaciones: nuevo estado `cancelled` y transición `accepted → cancelled` restringida a admin/administrativo y sin reservas `confirmed` ligadas (DB3-08).
- `guard_quote_delete`: mensaje corregido (cancelar en vez de "rechazar") conservando la exención de teardown E2E (`app.e2e_teardown` + `is_e2e` + `e2e_scope`).
- UI: filtro de estado de cotizaciones incluye "Cancelada".


## 7.260.3 — 29/07/2026

- E2E: `e2e_teardown` marca su ejecución interna para que `guard_quote_delete` permita borrar únicamente cotizaciones `is_e2e` con `e2e_scope`, manteniendo bloqueado el borrado de cotizaciones aceptadas reales.

## 7.260.2 — 29/07/2026

- Refactor: `PortalInvoiceDetail` delega datos y totales a `usePortalInvoiceDetailData` y el resumen a `InvoiceSummaryCards`; se elimina la advertencia de ESLint por complejidad 17.

## 7.260.1 — 29/07/2026

- E2E: `e2e_seed_scenario` siembra la cotización en `draft` y la transiciona a `accepted`, alineándose con el trigger `validate_transition` (13 specs del shard 1/2 volvían a fallar en la siembra).
- Entregas: `validate_delivery_not_in_past` exime a las entregas registradas como `completed` (captura histórica).

## 7.260.0 — 29/07/2026

- DB2-06/07: `change_forklift_status` como flujo oficial de cambio de estado del equipo + guard de tabla; la bandera `is_e2e` deja de servir para evadir auditoría.
- DB2-08/09: notas de crédito con montos positivos y cuadre aritmético; pagos a proveedor exigen aprobación también por PostgREST.
- DB2-10/11: entregas no se pueden mover al pasado; rescatar cotización vencida exige nueva vigencia y no se reenvían cotizaciones caducas.
- DB2-12/19: los daños recuerdan y restauran el estado previo del equipo, no se archivan/borran sin cargo, y la re-inspección con daño nuevo se rechaza explícitamente.
- DB2-13/14/15: `supplier_bills.total` no baja de lo pagado, las partidas cuadran con el subtotal (±0.05) y se rechazan pagos sobre facturas en borrador.
- DB2-16/17/18: dominio de `deliveries.status`, contratos sin tasas/depósito negativos ni fechas incoherentes, y bloqueo de borrado de cotizaciones aceptadas o con reservas.
- DB2-20/21: regresiones `paid→sent/partial` sólo vía sync de pagos; sin lockout del último admin activo y exención e2e limitada a `@liftgo.test`.


## 7.255.0 — 29/07/2026

- R23-G: nueva RPC `reorder_prospect_stage` que reindexa `stage_order` de la columna origen y destino en una sola transacción (sin duplicados `#0`).
- R23-H: el reorder dentro de la misma columna usa `useMoveProspectStage` (optimista + reindexado) en lugar de un update plano.
- R23-I: soltar en el área vacía de una columna coloca la tarjeta al final, no al inicio.
- R23-J: `parseBankCsv` valida el número mínimo de columnas por perfil y reporta el renglón corrido con mensaje accionable.
- R23-F: `useRecordPaymentForm` resetea Referencia/Notas/Método/Fecha/Forma SAT al reabrir y los incluye en `isDirty`.



## 7.254.0 — 29/07/2026

- R23-1: se restauraron 10 celdas de dinero que se renderizaban vacías (proveedores, pólizas, reportes de costos/antigüedad/ingresos y portal) + guard automático `moneyCellRegression.test.ts`.
- R23-2: la vista de impresión libera `height`/`overflow` del shell `h-[100dvh]`, evitando el recorte del contenido.
- R23-A: `FormDialog` expone `requestClose` por contexto; el botón "Cancelar" de `FormActions` respeta el aviso de cambios sin guardar.
- R23-B: `ProspectFormDialog` espera el guardado antes de cerrar y conserva la captura si falla.
- R23-C: `useMoveProspectStage` sólo invalida cuando no quedan movimientos en vuelo (sin rebotes al arrastrar rápido).
- R23-D: KPIs de Cuentas por Pagar usan `kpiSizeClass` para montos largos.
- R23-E: `parseAmount` interpreta correctamente la coma decimal es-MX ("1.500,50" → 1500.50).



## 7.253.4 — 29/07/2026

- Se aisló la limpieza de datos E2E para que las ejecuciones paralelas de CRM y conciliación bancaria no borren escenarios activos.
- La prueba del Kanban ahora espera la confirmación de persistencia antes de recargar la página.
