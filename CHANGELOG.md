## [7.381.1] - 2026-08-30
### Fix (UX): bloque explicable ante rechazo por carrera del guard de asignación de venta
- `useCreateInvoice` ahora acepta `onBusinessBlock` (convención de fase 1/2); `useInvoiceFormSubmit` y `useInvoiceFormLogic` lo cablean sólo para el código `quote_sale_assignment_incomplete`.
- Si `trg_guard_invoice_sale_assignment` rechaza el INSERT por carrera/estado obsoleto, el formulario reusa la pantalla existente `SaleAssignmentBlocked` en vez del toast genérico de error.
- Sin cambios en SQL, reglas de negocio ni en la prevención determinística de la UI; los demás errores de facturación conservan su toast estándar.
- Prueba de regresión: `useCreateInvoice.businessBlock.test.tsx` (bloque entregado + toast suprimido; errores no relacionados intactos).

## [7.381.0] - 2026-08-30
### Fix (P1-B integridad): guard de asignación completa para facturar cotizaciones de venta
- Nueva función `public.quote_sale_units_unassigned(uuid)` (SECURITY DEFINER, `SET search_path = public`): espejo exacto de `useQuoteSaleAssignmentStatus` — partida de venta = descripción que termina en `- Venta de equipo`; requerido = `quantity` (0/NULL => 1); asignado = filas de `quote_assigned_forklifts` con ese `line_index`. `EXECUTE` revocado a `anon`/`authenticated`.
- Nueva función `public.guard_invoice_sale_assignment()` y trigger `trg_guard_invoice_sale_assignment` (BEFORE INSERT en `public.invoices`): si la factura referencia una cotización con partidas de venta incompletas, rechaza con P0001 indicando cuántas unidades faltan. Cubre todas las rutas de alta (UI, RPC, edge functions, SQL directo).
- Sin cambios para facturas sin `quote_id`, cotizaciones de renta ni cotizaciones totalmente asignadas. El guard no muta asignaciones ni el estatus de las unidades.
- `service_role`/tareas internas también quedan sujetas a la regla (es invariante de integridad); sólo `app.e2e_seed = 'on'` está exento, como el resto de guards del repo.
- `businessBlocks`: nuevo código `quote_sale_assignment_incomplete` con la copia canónica; el rechazo del backend por carrera/estado obsoleto se explica igual que la prevención de la UI (`SaleAssignmentBlocked`).
- Pruebas: `supabase/tests/r_fix35_invoice_sale_assignment_guard_smoke.sql` y `src/lib/rules/__tests__/invoiceSaleAssignmentGuard.test.ts`.

## [7.380.0] - 2026-08-30
### Fix (P1 integridad): guard de archivado de clientes en la BD
- Nueva función `public.guard_customer_archive()` (SECURITY DEFINER, `SET search_path = public`) y trigger `trg_guard_customer_archive` (BEFORE UPDATE OF `deleted_at` en `public.customers`): sólo actúa en la transición `deleted_at IS NULL -> NOT NULL`. Rechaza con 42501 si quien archiva no es `admin`/`administrativo` (ventas incluido, pese a la policy amplia) y con P0001 si el cliente tiene reservas activas.
- Nuevo helper `public.customer_has_active_bookings(uuid)` con la definición canónica de reserva activa (`confirmed`, `in_progress`); `soft_delete_customer` lo reutiliza para evitar lógica duplicada. `EXECUTE` revocado a `anon`/`authenticated`.
- El saldo pendiente NO se convierte en regla de base de datos: sigue siendo advertencia/bloqueo de UI (decisión de producto separada).
- Desarchivar (`deleted_at` -> NULL) y las ediciones normales de clientes quedan sin cambios. Sin sesión (service_role/tareas) y con `app.e2e_seed = 'on'` el guard no interviene.
- Pruebas: `supabase/tests/r_fix34_customer_archive_guard_smoke.sql` (catálogo + comportamiento por rol, transacción con ROLLBACK).

## [7.379.0] - 2026-08-29
### Fix (P0 integridad): guard de borrado de pagos a proveedor en la BD
- Nueva función `public.guard_supplier_payment_delete()` (SECURITY DEFINER, `SET search_path = public`) y trigger `trg_guard_supplier_payment_delete` (BEFORE DELETE en `public.supplier_payments`): rechaza el borrado si `rep_status = 'received'` (P0001), si la factura de proveedor está `cancelled` (P0001) o si el usuario no es `admin` (42501).
- Convención preservada: sin sesión (`auth.uid() IS NULL`, service_role/tareas) y con `app.e2e_seed = 'on'` el guard no interviene, igual que `validate_prospect_close()`.
- `businessBlocks`: los mensajes del guard se mapean a `supplier_payment_rep_received` y `supplier_bill_cancelled`; `useDeleteSupplierPayment` acepta `onBusinessBlock` y `useSupplierPaymentActions` muestra el bloqueo del servidor con la misma copia que la prevención en UI.
- Sin cambios en cálculos de saldo, emisión/recepción de REP, conciliación bancaria (`ON DELETE SET NULL` intacto) ni en la máquina de estados de facturas de proveedor.
- Pruebas: `supabase/tests/r_fix33_supplier_payment_delete_guard_smoke.sql` (catálogo + comportamiento real por rol) y `src/lib/rules/__tests__/supplierPaymentDeleteGuard.test.ts`.

## [7.378.0] - 2026-08-29
### Feature: bloqueos de negocio explicables (lote 3, solo presentación)
- `businessBlocks`: nuevos códigos `supplier_bill_pending_approval`, `supplier_payment_rep_received`, `payment_rep_stamped_locked`, `portal_payment_fully_reported`, `damage_not_repaired`, `prospect_stage_not_negotiation`, `quote_expired` y `quote_already_converted`, más el patrón de error para el cierre de prospecto fuera de Negociación.
- CxP: `supplierBillPaymentBlock` explica "Registrar pago" bloqueado (pagada, cancelada, pendiente de aprobación, rechazada) con las mismas condiciones que ya deshabilitaban el botón; eliminar pago de proveedor con REP recibido usa el bloque compartido.
- Facturas: el candado por REP timbrado (columna de pagos y `EditPaymentDialog`) se unifica en `payment_rep_stamped_locked`, sin tocar timbrado ni cancelación.
- Daños: `damageArchiveBlockReason` devuelve el bloque explicable con la condición real (`invoice_id` o `repaired`); "Archivar" queda visible y deshabilitada.
- CRM: cerrar como Ganado fuera de Negociación se explica con el bloque compartido; la denegación por rol sigue en `RoleGuard`.
- Cotizaciones: "Aceptar" vencida y "Ya convertida a Reserva" usan el patrón compartido; se agrega "Ver reserva" reutilizando la relación ya cargada (sin consultas nuevas).
- Portal: reportar pago con saldo reportable en cero se explica; la condición técnica (datos del cliente aún cargando) se mantiene aparte.
- Sin cambios en SQL, RLS, RPC guards, máquinas de estado, lógica fiscal ni permisos.

## [7.377.0] - 2026-08-29
### Feature: bloqueos de negocio explicables (fase 2, solo UX/contrato de error)
- `businessBlocks`: nueva `describeForkliftRentalBlock(targetStatus)` — una sola regla canónica de renta activa con título contextual (vender / dar de baja / mantenimiento / disponible); motivo y siguiente paso alineados a la devolución pendiente. `StatusChangeCard` la usa tanto en la prevención en UI como al mapear el rechazo del RPC.
- `InvoiceDetailActions`: `invoice_stamped_locked` conectado — con permiso `Facturas: full`, Editar queda visible y deshabilitado en facturas timbradas (antes se ocultaba). `invoice_cancellation_pending` sustituye el tooltip ad-hoc del botón "Registrar pago" bloqueado.
- `useRecordPaymentForm` / `RecordPaymentDialog`: `payment_exceeds_balance` conectado — el sobrepago se explica junto al monto y deshabilita el submit (misma regla BL-11, sin duplicar el cálculo de saldo); el rechazo del backend por carrera se mapea con `resolveBusinessBlock` en vez de un toast técnico.
- `BookingExtensionsCard`: `extension_already_billed` conectado — "Facturar extensión" se muestra deshabilitada con el motivo y se conserva "Ver factura" (ahora vía `ROUTES.invoices.detail`).
- Sin cambios en SQL, RLS, RPC guards, máquinas de estado, lógica fiscal ni permisos.
- Pruebas: `useRecordPaymentForm.blocks.test.ts`, `BookingExtensionsCard.test.tsx` y cobertura contextual en `businessBlocks.test.ts`.

## [7.376.0] - 2026-08-29
### Feature: bloqueos de negocio explicables (fase 1, solo UX/contrato de error)
- Nuevo `src/lib/rules/businessBlocks.ts`: catálogo tipado de bloqueos (`action` / `reason` / `nextStep` / `tone`) y `resolveBusinessBlock(error)`, que se apoya en `translatePgError` (constraint → SQLSTATE → texto) sin duplicar el catálogo de Postgres.
- Nuevos `src/components/feedback/BlockedActionNotice.tsx` (Alert `info`/`warning`, detalle contextual y enlace "Ver…/Resolver…" vía `ROUTES`) y `BlockedActionButton.tsx` (acción visible pero deshabilitada, motivo en tooltip).
- `useEntityMutation`: nueva opción `onBusinessBlock` — si el error corresponde a una regla catalogada, la vista muestra el bloque explicativo y se suprime el toast genérico.
- Flujos convertidos: `StatusChangeCard` (renta activa, con prevención en UI y manejo de carrera desde el RPC), `CloseWorkOrderDialog` (daño abierto + "Resolver daño"), `ContractDetailActions` (contrato firmado/completado), `SupplierBillPaymentActions` + `billPermissions` (pagos, aprobada, rechazada, pagada, cancelada).
- Sin cambios en SQL, RLS, RPC guards, máquinas de estado ni permisos: el backend sigue siendo la autoridad final.
- Pruebas nuevas: `src/lib/rules/__tests__/businessBlocks.test.ts`, `src/components/feedback/__tests__/BlockedAction.test.tsx`, `src/features/accounts-payable/lib/__tests__/billPermissions.test.ts`.

## [7.375.0] - 2026-08-29
### Docs: limpieza extensa de archivos Markdown (157 → 12)
- Eliminados 130 planes archivados (`.lovable/*.md` y `.lovable/plan/*.md`); `.lovable/plan/` se agregó a `.gitignore`. El contenido efectivo de cada plan ya está en este changelog y en el código.
- Eliminados 10 reportes con fecha fija: `docs/coverage-matrix-r2.md`, `docs/dependency-audit.md`, `docs/dependency-update-audit-2026-08-14.md`, `docs/mobile-qa-v6.13.2.md`, `docs/e2e-roadmap.md`, `docs/lighthouse/baseline.md` y toda la carpeta `docs/audits/` (knip, toasts, R4-cierre, H-6).
- Eliminados 5 README de carpeta en `src/` (calendar/lib, operations/hooks, bookings/hooks, quotes/hooks, system/hooks); se conservan `src/components/domain/README.md` y `src/lib/domain/README.md` por contener reglas de decisión reales.
- `architecture.md`: §15 reescrita (suites E2E vigentes, auth por API en `global.setup.ts`, nueva §15.4 de pruebas RLS, Lighthouse sin baseline versionado); §5.2, §20.6 y §24 sin referencias muertas.
- `README.md`: PDF corregido a `@react-pdf/renderer`, nueva sección "Documentación" con los archivos vivos y punteros a `tests/e2e/README.md` y `supabase/tests/rls/README.md`.
- Retirado `scripts/dependency_audit.py` (solo generaba el reporte eliminado) y ajustado el mensaje final de `scripts/lighthouse-baseline.sh`.
- Documentos vivos: `README.md`, `architecture.md`, `CHANGELOG.md`, `docs/architecture-guardrails.md`, `docs/paginacion-cursor.md`, `.github/pull_request_template.md`, 2 README de `src/` y 2 de pruebas.

## [7.374.4] - 2026-08-29
### Fix: sesión expirada ya no termina en "Página no encontrada"
- `sessionExpiry.handleSessionExpired` redirigía a `/auth?redirect=…`, ruta inexistente en el router: sin sesión se veía el login inline, pero tras autenticarse la URL `/auth` caía en el catch-all 404 y el usuario perdía su pantalla. Ahora redirige a `/login?redirect=…`.
- Router: la ruta `/login` pasa de `<Navigate to="/">` a `LoginRedirect`, que honra `?redirect=` (validado: sólo rutas internas que empiezan con "/" y no "//", contra open redirects) y regresa al usuario a la página donde estaba.
- El guard "ya estoy en acceso" de `sessionExpiry` ahora reconoce `/login`.

## [7.374.3] - 2026-08-28
### CI: actions oficiales de GitHub al día
- `actions/checkout` v6 → **v7** (20 usos en `ci.yml`, `codeql.yml`, `bundle-size.yml`, `gitleaks.yml`, `lighthouse.yml`, `rls-db-tests.yml`, `changelog-check.yml`): endurece el manejo de credenciales en PRs de forks; mismas entradas.
- `actions/download-artifact` v6 → **v8** (2 usos en `ci.yml`): requiere `upload-artifact` v6+, ya estábamos en v7.
- `actions/setup-node` v5 → **v7** (`.github/actions/setup-bun-project`): corre sobre Node 24, mismas entradas `node-version`/`cache`.
- Sin cambios: `actions/upload-artifact@v7`, `actions/cache@v6`, `github/codeql-action@v4` (ya en su última major). Las actions de terceros siguen fijadas por SHA vía Dependabot.

## [7.374.2] - 2026-08-28
### Lint: refs en render, no-control-regex y orden de imports
- `useCustomerDetailPage`, `useForkliftFormLogic`, `useInvoiceFormLogic` (react-hooks/refs): los snapshots de bloqueo optimista (`customer.version`, `updated_at`, `invoice.version`) pasan de `useRef` leído/escrito en render a `useState` + efectos (`prev ?? valor` conserva la captura única; el reset por cambio de `id` se mantiene). Mismo comportamiento, patrón compatible con React Compiler.
- `exportCsv` (no-control-regex, único **error** del lint): se reemplaza la regex `/^[\s\u0000-\u001F]*[=+\-@]/` por comparación de caracteres (`startsWithFormula`), misma cobertura anti CSV-injection.
- `DeliveriesPage`, `MaintenancePoliciesTab` (max-lines) y `MaintenanceDetailSheet` (complexity 16→~11): se extraen `buildDeliveryColumns`, `DeliveryMobileCard`, `PolicyMobileCard` y `MaintenanceDetailActions` sin cambios visuales.
- Orden de imports (`import-x/order`) en `EditPaymentDialog`, `GlobalInvoiceFields`, `useInvoiceFormSubmit` e `InvoiceForm`.

## [7.374.1] - 2026-08-28
### Fix CI: teardown E2E y prueba del pagaré
- `e2e_teardown` / `e2e_seed_portal_scenario`: se elimina el `DELETE FROM storage.objects` (la plataforma lo bloquea con "Direct deletion from storage tables is not allowed"), que hacía fallar 6 pruebas E2E. La limpieza de objetos huérfanos debe hacerse vía Storage API.
- `contractPlaceholders.test.ts`: la prueba esperaba 5% cuando el contrato tiene 0%; desde G-A3 un 0% explícito se respeta. Se separa en dos casos (0% explícito vs. tasa inválida).

## [7.374.0] - 2026-08-28
### Ronda G (cierre final): guard de cierre de deals y avisos de TC en CxP
- `validate_prospect_close()` (G-C2): guard de rol en la base de datos para `cerrado_ganado` (`has_role((select auth.uid()), 'admin'|'administrativo')`, `ERRCODE = insufficient_privilege`). El rol `ventas` tiene `FOR ALL` sobre `prospects`, así que la regla del cliente (`useProspectGuard`) se podía rodear llamando a la API. Se respeta `app.e2e_seed` y se conserva `SET search_path = public`.
- `pgErrorCatalog` (G-C2): mensaje prioritario en español para el nuevo error de cierre no autorizado.
- `CuentasPorPagarPage` (G-B6): aviso con `fxMissingCount` — paridad con el reporte de antigüedad; los KPIs ya excluían esas facturas pero sin explicarlo.
- `PaymentsExportTable` (G-B5): badge "Sin TC" en el saldo de facturas en divisa sin tipo de cambio.
- `supabase/tests/g_c2_prospect_close_role_smoke.sql`: smoke del guard de rol.

## [7.373.2] - 2026-08-28
### Ronda G (cierre): CxP multimoneda y expiración de sesión
- `RegisterSupplierPaymentDialog` / `SupplierBillDetailContent` (G-B1): el saldo se formatea con `formatCurrencyWithCode` y la moneda real de la factura; antes una factura en USD mostraba el saldo como pesos y se dispersaba el monto equivocado.
- `PaymentsExportTable` (G-B2): columna "Saldo" con código de moneda y badge para no-MXN en lotes mixtos.
- `useExportablePayables` (G-B5): se agrega `exchange_rate` al SELECT para poder detectar tipos de cambio faltantes.
- `lib/auth/sessionExpiry` + `AppProviders` (G-C3): un 401/`PGRST301` ahora ejecuta `signOut()` y redirige a `/auth?redirect=…` una sola vez; antes solo aparecía el toast "Tu sesión expiró" y la pantalla quedaba inservible hasta recargar a mano.

## [7.371.0] - 2026-08-28
### Ronda F: portal del cliente y PDFs fiscales
- `PortalQuotes` / `PortalQuoteDetail` / `TotalsBreakdown` (F2): `formatCurrencyWithCode` con `quote.currency`; antes toda cotización se formateaba en MXN aunque estuviera en USD y el cliente podía aceptarla creyendo un monto ~18x menor.
- `portalKpis.derivePortalKpis` (F1): usa `toMxn(balance, moneda, tipo_cambio)` + `sumMoney` en vez de multiplicar siempre por `tipo_cambio`. Elimina la divergencia entre el saldo del tablero y el del estado de cuenta.
- `fetchInvoicePdfData` / `buildInvoicePdf` (F3): `receptor_razon_social` y `receptor_domicilio_fiscal_cp` (snapshot fiscal al emitir) son la fuente primaria; el JOIN vivo a `customers` queda como respaldo y usa `maybeSingle()`.
- `PortalSections` / `PortalUpcomingDues` (F4): enlace "Ver todas (N)" cuando la lista se recorta a 5.

## [7.370.0] - 2026-08-28
### Ronda E: archivado de OT, drift monetario y guardas de UI
- `soft_delete_maintenance_log` (E1): una OT `completed` solo la archiva `admin` y ya NO se borran `maintenance_parts` / `maintenance_labor` de órdenes cerradas (era pérdida de historial de costos). Las órdenes abiertas siguen limpiando sus renglones. `MaintenanceDetailSheet` deshabilita "Archivar" para no-admin en OT cerradas.
- `InvoiceDetail` / `paymentCurrency` (E2): `sumMoney` para pagos y notas de crédito, `roundMoney` para el saldo. Elimina el drift IEEE-754 que mostraba saldo residual en facturas totalmente pagadas.
- `CustomerDetailPage` (E3): rama `isError` con `QueryErrorState` + reintentar; antes un fallo de red/RLS se veía como "Cliente no encontrado".
- `MaintenancePolicyForm`, `CreateCreditNoteDialog`, `RegisterSupplierPaymentDialog` (E4): `isDirty` conectado a `FormDialog` para confirmar antes de descartar cambios.
- `useCRMMetrics` (E5): nuevo helper `toMty()` en `src/lib/utils.ts`; los cortes MTD/30d comparan fechas de cierre en la misma escala (America/Monterrey).

## [7.369.1] - 2026-08-28
### Ronda R6 (fix-35): limpieza E2E incompleta (R6-18)
- `e2e_seed_portal_scenario` y `e2e_teardown`: DELETE de `public.credit_notes` por `invoice_id`/`customer_id` E2E antes de borrar `invoices`/`customers`. La FK `credit_notes_invoice_id_fkey` es ON DELETE RESTRICT y las NC no llevan `is_e2e`, así que el teardown fallaba con 23503 y dejaba datos de prueba residuales.
- Ambas funciones borran los objetos huérfanos `payment-proofs/<customer_id>/%` de `storage.objects` (usando `EXISTS ... LIKE` en vez del `LIKE ANY (SELECT array_agg(...))` del parche).
- `e2e_teardown` reporta los conteos `credit_notes` y `storage_objects`.
- Se conservan guard de rol admin, `SET search_path = public`, validación `allow_e2e_seed`, la regla de no reasignar roles ajenos y los permisos (`REVOKE` a anon / `EXECUTE` a authenticated). `auth.uid()` envuelto en `(select auth.uid())`.

## [7.369.0] - 2026-08-28
### Ronda R6 (fix-34): candados optimistas y falsos conflictos
- `useCustomerDetailPage`: snapshot de `customer.version` al abrir el diálogo de edición (`useRef` + `setEditOpen` envuelto). Antes se pasaba la versión viva de React Query y un refetch con el diálogo abierto neutralizaba el candado → lost update (R6-06).
- `useUpdateCustomer`: el probe compara `still.version !== expectedVersion`; si coincide, el 0-filas viene de RLS/permisos y ya no se reporta un falso `stale_write` (R6-11).
- `useUpdateForklift`: el probe selecciona `updated_at` y lo compara con el snapshot en vez de solo comprobar existencia (R6-12).
- `useForkliftFormLogic`: `expectedUpdatedAt` congelado al cargar el registro y reseteado al cambiar el `id` de ruta (R6-12).
- `useInvoiceFormLogic`: reset de `invoiceVersionRef` en `useEffect` sobre `id` (navegar de /invoices/A/edit a /invoices/B/edit no remonta el form) y nuevo `setInvoiceVersion` + `existing` / `isLoadingInvoice` expuestos (R6-19, R6-13, R6-25).
- `InvoiceForm`: tras `updateInvoice` se actualiza el snapshot con `data.version` antes de `syncInvoiceBookings`, para que reintentar Guardar no choque contra la propia escritura (R6-13); y en modo edición con id inexistente o sin permisos se muestra `EmptyState` con salida a /invoices en vez del form vacío cargando indefinidamente (R6-25).
- Verificación: 317 pruebas de facturas/clientes/flota en verde y typecheck limpio.

## [7.368.0] - 2026-08-28
### Ronda R6 (fix-33): cola de reintentos CFDI
- Migración: `cfdi_retry_queue.deferrals integer not null default 0` — contador real en vez del truco de prefijo `[deferrals=N]` en `last_error` que proponía el parche (R6-02).
- `process-cfdi-retry-queue`: tope `MAX_DEFERRALS = 10`; superado, la fila pasa a `exhausted` con diagnóstico. Antes `attempts` quedaba congelado y `max_attempts` nunca se alcanzaba → bucle infinito contra el PAC (R6-02).
- Backoff creciente con `nextRetryAt(deferrals)` (2, 4, 8… min, tope 60) en vez del `next_retry_at` fijo de ~2 min (R6-22).
- Nuevo `isDocCancelled()`: tras el refresh se relee `invoices` / `credit_notes` / `payments` y, si la cancelación quedó confirmada, la fila se cierra como `succeeded` (R6-03).
- `refresh-cancellation-status`: `AbortSignal.timeout(10_000)` y logs de warning en respuesta no-OK y en excepción (antes `catch {}` vacío) (R6-23).
- `cancel` (facturas) entra al camino de deferral, pero **solo** cuando el 409 trae `code: "CANCELLATION_IN_PROGRESS"` (nuevo en `cancel-cfdi/handler.ts`). El 409 de `assert_invoice_cancellable` (factura no cancelable) sigue siendo terminal — el parche original los mezclaba y habría reintentado 10 veces una factura con pagos aplicados (R6-08, ajustado).
- `deferrals` se reinicia a 0 al cerrar la fila o al consumir un intento real.
- Tests: 5 casos nuevos en `supabase/functions/process-cfdi-retry-queue/index_test.ts` (13 pasando).

## [7.367.0] - 2026-08-28
### Ronda R6 (fix-32): portal de pagos, conciliación y storage
- `approve_payment_intent`: `SELECT ... FOR UPDATE` de la factura (dos aprobaciones concurrentes podían sobrepasar el saldo), conversión FX de `payments` con el mismo `CASE` que `sync_invoice_status_from_payments`, descuento de intents `pending_review`, criterio canónico de NC (`stamped` + `status <> 'cancelled'` + `cancellation_status IS DISTINCT FROM 'accepted'`) y pago insertado con `exchange_rate = NULL` (R6-04).
- `validate_payment_intent_amount`: lee `moneda`/`tipo_cambio` y suma los pagos convertidos; en facturas en divisa el saldo disponible ya no se calculaba 1:1 (R6-09).
- `confirm_bank_match` y `get_bank_match_candidates`: `LEFT JOIN invoices` + fallback `COALESCE(NULLIF(p.exchange_rate,0), NULLIF(i.tipo_cambio,0))` (R6-10).
- Policy INSERT de `customer_payment_intents`: excluye facturas `cancelled`/`draft` o con cancelación aceptada y exige `(storage.foldername(proof_url))[2] = invoice_id` (R6-15).
- Policy DELETE de `storage.objects` (`payment-proofs`): el `NOT EXISTS` de intents ya procesados sale del `OR` de roles, así admin/administrativo tampoco borran evidencia aprobada (R6-14).
- Policy INSERT de `storage.objects`: se elimina `COALESCE(metadata->>'mimetype','application/pdf')`; el mimetype declarado es obligatorio (R6-24).
- Bucket `payment-proofs`: privado y con límite de 10 MB (R6-05). Nota: se configuró con la herramienta de storage, no por SQL (`INSERT INTO storage.buckets` está prohibido y además el bucket ya existía, por lo que el `ON CONFLICT DO NOTHING` del parche no habría hecho nada).
- Nuevo smoke `supabase/tests/r_fix32_portal_pagos_smoke.sql` (15 verificaciones).

## [7.366.0] - 2026-08-28

### Ronda R6: triggers de facturación, pagos en divisa y bypass GUC
- `sync_invoice_status(uuid)`: nuevo helper; `sync_invoice_status_from_credit_notes()` llamaba a la función *trigger* de pagos fuera de contexto (`trigger_protocol_violated`) (R6-01).
- `trg_sync_invoice_from_credit_notes`: ahora también dispara con `cfdi_status` y `cancellation_status`.
- `trg_payment_amount_mxn()`: permite el cruce divisa→MXN cuando hay TC (pago o factura); sólo falla si no hay ninguno (R6-07).
- `trg_payments_currency_matches_invoice`: `UPDATE OF currency, invoice_id, exchange_rate, amount` (R6-16).
- `sync_forklift_rental_status`, `cancel_booking`, `create_booking`, `complete_return_inspection`, `e2e_seed_portal_scenario`: `EXCEPTION WHEN OTHERS` + reset de `app.forklift_rpc` / `app.booking_rpc` / `app.e2e_seed` + `RAISE` (R6-17).
- `get_financial_kpis`: `expiring_contracts` excluye clientes E2E y unidades borradas con `(f.id IS NULL OR f.deleted_at IS NULL)` para no perder contratos sin unidad; se **conserva** la conversión a MXN del MRR (FIX A4) que el parche original revertía (R6-20).
- `get_dashboard_stats`: `invoice_stats.breakdown` suma en MXN; se **conserva** `v_invoice_forklift_revenue` en `utilization` (FIX A1) (R6-21).
- Nuevo smoke `supabase/tests/r_fix31_triggers_smoke.sql`.

## [7.365.1] - 2026-08-27
### Fix: `audit_trigger_fn()` insertaba `is_e2e` NULL
- `current_setting('app.e2e_seed', true)` devuelve NULL fuera de sesiones E2E; `false OR NULL = NULL` dejaba `v_is_e2e` en NULL y el INSERT violaba el NOT NULL de `audit_logs.is_e2e` (SQLSTATE 23502).
- Rompía `supabase db start` en CI (seed.sql sobre `company_settings`) → 0/21 suites SQL smoke.
- Todos los predicados del trigger van ahora envueltos en `coalesce(..., false)`; `v_source` con `coalesce(..., 'system')`.

## [7.365.0] - 2026-08-27
### Ronda D de auditoría: truncamiento, monedas y drift de centavos
- `useDamageRecords`: `.limit(LIST_FETCH_LIMIT)` — la lista de daños se truncaba en 1000 filas sin aviso y subestimaba los costos en reportes (D1).
- `useReconciliationData`: `.limit(LIST_FETCH_LIMIT)` en la consulta de conciliación fiscal; el total timbrado y los huecos de folio quedaban incompletos en rangos amplios (D2).
- `usePaymentHistoryColumns`: `formatCurrencyWithCode(amount, currency)` en vez de `formatCurrency` (un pago USD se formateaba con reglas MXN) (D2).
- `MaintenancePartsSection` y `WorkOrderCloseSummary`: sumas con `sumMoney`/`roundMoney` para evitar drift IEEE-754 en costos de OT (D3).
- `RentalFinancialSummary`: usa la moneda de la reserva; si las tarifas no son MXN, el "Balance Restante" ya no compara 1:1 contra lo facturado en pesos. "Revenue Esperado" → "Ingreso Esperado" (D4).
- `PartDetailSheet`: fechas con `formatDateTimeMty` en lugar de `date-fns` con TZ del navegador.

## [7.364.0] - 2026-08-27
### Bitácora: origen de cada movimiento (usuario / sistema / prueba)
- `audit_logs`: columnas `is_e2e` y `source`, índice parcial para la lista sin pruebas.
- `audit_trigger_fn()`: marca sesiones E2E aunque la tabla no tenga `is_e2e`; `source = 'system'` para movimientos sin usuario o con `app.audit_source = 'system'`.
- `purge_e2e_audit_logs()`: RPC admin que borra solo filas `is_e2e = true` (usa `app.audit_maintenance`).
- Bitácora: filtro "Origen", badges "Sistema"/"Prueba" y botón de purga para admin.

## [7.363.0] - 2026-08-27
### Entregas atrasadas visibles y fechas con reloj de Monterrey
- Entregas: badge "Vencida · N días" y aviso resumen de entregas programadas fuera de fecha (C2).
- Entregas: columna "Tipo" en escritorio y filtros de búsqueda, estado y tipo con `useTableFilters` (C2).
- CRM: `useCRMMetrics` usa `nowMty()` para los cortes MTD y 30 días (C3).
- Pagos (cliente y proveedor) y factura global: validación de "no futuro" con `nowMty()` (C4).

## [7.362.0] - 2026-08-27
### Cierre de auditoría: errores de carga visibles, saldos por moneda y facturas sin vencimiento
- CRM cerrados: si la consulta falla se muestra el error con reintento en vez de listas vacías (B3).
- Detalle de proveedor: aviso de listas truncadas sobre los totales de gastos y mantenimiento (B5).
- Detalle de factura: pagos normalizados a la moneda del documento y aviso de pagos sin tipo de cambio (B6).
- Estado de resultados: gastos de proveedor convertidos a MXN y sin incluir borradores (A3).
- MRR y KPIs financieros: rentas en divisa convertidas a MXN (A4).
- Antigüedad de saldos / Cuentas por pagar: bucket y marca "Sin vencimiento" (A7).

## 7.359.3 - 2026-08-27

**Pruebas E2E: el seeding ya no se apaga a media corrida**

- `tests/e2e/fixtures/seed.ts` reintenta el seeding tras re-habilitar `allow_e2e_seed` si el RPC responde "seeding disabled".
- `tests/e2e/global.teardown.ts` no apaga el interruptor en corridas por shards (`--shard` o `E2E_KEEP_SEED_FLAG=1`).

## 7.359.2 - 2026-08-27

**Datos de prueba: el interruptor de seeding queda apagado (fix-29 / R5-07)**

- R5-07: `allow_e2e_seed` queda en `false` en el entorno actual; el valor por defecto para entornos nuevos ya era `false`.
- El teardown de las pruebas E2E vuelve a apagar el interruptor al terminar la suite, aunque falle la purga de datos de prueba.

## 7.359.1 - 2026-08-27

**Edición de facturas: bloqueo optimista más confiable (fix-30)**

- R5-09: la versión de la factura se congela al abrir el formulario, así un refresco en segundo plano ya no permite pisar cambios de otra persona.
- R5-16: en edición, el botón Guardar queda deshabilitado ("Cargando la factura…") hasta que la factura termina de cargar.
- R5-17: el mensaje "otro usuario modificó esta factura" solo aparece cuando la versión realmente cambió; si fue un tema de permisos, se muestra el error correcto.
- R5-18: el seed de desarrollo distingue entre un correo que no existe (aviso) y un usuario que ya era administrador (nota informativa).

## 7.359.0 - 2026-08-27

**Portal de clientes: comprobantes más seguros y sin sobrepagos por reportes simultáneos (fix-29)**

- R5-06: la limpieza del escenario de pruebas del portal ya no borra pagos ni reportes de pago de facturas reales del cliente.
- R5-08a: al reportar un pago, el comprobante debe estar en la carpeta del propio cliente.
- R5-08b: borrar un comprobante propio pendiente ya no se bloquea por reportes de otros clientes.
- R5-12: se bloquea la factura al validar el monto, así dos reportes simultáneos no pueden exceder el saldo.
- R5-19: sólo se aceptan comprobantes PDF, PNG, JPEG o WebP; el bucket sigue privado y con límite de 10 MB.
- R5-07 descartado: apagar `allow_e2e_seed` globalmente rompería CI; el valor por defecto para entornos nuevos ya es `false`.

## 7.358.0 - 2026-08-27

**Indicadores financieros y tablero sin datos de prueba ni mezcla de monedas (fix-28)**

- R5-03: los KPIs financieros (MRR, DSO, vencido) ya no incluyen registros de prueba ni unidades eliminadas.
- R5-04: una factura con pago parcial ya puede pasar a "pagada" al completarse el saldo.
- R5-05: si falla revertir un cambio desde la bitácora, el permiso interno de reversión se apaga siempre en vez de quedar activo.
- R5-10: en el flujo de efectivo, las notas de crédito en dólares se convierten a pesos con el tipo de cambio de su factura y solo cuentan las vigentes (timbradas, no canceladas y sin cancelación aceptada); se excluyen las de facturas de prueba.
- R5-11: el ingreso por unidad en el ranking de utilización también se convierte a pesos.

## 7.357.0 - 2026-08-27

**Pagos en otra moneda con tipo de cambio y estados correctos con nota de crédito parcial (fix-27)**

- R5-01: se permite registrar un pago en moneda distinta a la de la factura cuando hay tipo de cambio (en el pago o en la factura); sin tipo de cambio se sigue rechazando.
- R5-15: con nota de crédito parcial y sin pagos, una factura pagada pasa a "vencida" si ya venció (antes siempre a "enviada") y el resto de los casos pasa a "parcial".
- R5-02: un 409 al cancelar notas de crédito o complementos de pago ya no marca la fila como fallo terminal; se reprograma sin gastar intentos y se consulta el estado real en el SAT.
- R5-13: al liberar el apartado de cancelación de una factura solo se toca si sigue en "pendiente", para no pisar un estado ya reconciliado.
- R5-14: si falla la construcción del cliente del PAC, el apartado de cancelación ya se libera correctamente.

## 7.356.1 - 2026-08-27

**Se restaura la suite E2E en CI**

- Las pruebas E2E fallaban con "E2E seeding disabled on this environment": el permiso de datos de prueba quedó apagado tras R4-21.
- `tests/e2e/global.setup.ts` ahora habilita `allow_e2e_seed` con la sesión admin antes de correr la suite.
- El valor por defecto para entornos nuevos sigue siendo `false`.

## 7.349.0 - 2026-08-26

**Bitácora, portal de clientes y control de acceso (fix-17 / fix-18)**

- N-18: revertir un cambio desde la bitácora ya verifica que el registro no se haya modificado después; si hubo cambios posteriores se rechaza con un mensaje claro en vez de pisarlos en silencio.
- N-31: ya no se puede invitar al portal a un cliente archivado; al archivarlo se desvincula su cuenta del portal y deja de ver su registro.
- N-34: el diálogo de registrar pago avisa en español si la fecha es anterior a la emisión de la factura, en vez de mostrar el error crudo de la base.
- N-36: extender una renta ya no se bloquea por órdenes de mantenimiento archivadas, apenas agendadas o canceladas; solo cuentan las que representan trabajo real.
- N-40: la lectura del horómetro en entregas no puede ser menor a la última registrada de esa unidad; la regla ahora vive también en la base de datos.
- N-45: un usuario desactivado pierde el acceso de inmediato (antes conservaba permisos hasta que caducaba su sesión). Los usuarios sin perfil se consideran activos.
- N-30: si falla la asignación de rol o el perfil al invitar a un usuario interno, la cuenta a medias se elimina automáticamente.
- Descartados por ya estar resueltos o ser inocuos: N-17 (la policy de dispatchers sobre la bitácora ya no existe), N-26 (el bloqueo de campos de contratos firmados ya está cubierto) y N-22 (condición equivalente en depreciación).
- Nueva prueba de humo SQL: supabase/tests/r_fix17_18_smoke.sql.

## 7.348.0 - 2026-08-26

**Panel y reportes financieros (fix-16)**

- N-14: el Panel vuelve a mostrar la utilización por unidad y las alertas de mantenimiento próximo (7 días); antes esas tarjetas siempre salían vacías porque el backend no enviaba los datos.
- N-16: los conteos de flota (disponibles, rentados, en mantenimiento, retirados) ya no se traslapan y suman el total real; además las cifras del Panel excluyen los registros de prueba.
- N-15: la Cartera Vencida deja fuera las facturas en divisa sin tipo de cambio y avisa cuántas quedaron sin incluir.
- N-19: al convertir un pago a pesos manda el tipo de cambio del pago y, si no hay, el de la factura; antes el Panel y el reporte de ingresos daban cifras distintas para el mismo pago.
- N-20: el reporte de ingresos por mes ya no cuenta 1 a 1 los pagos en divisa sin tipo de cambio; ahora los marca como faltantes de tipo de cambio.

## 7.347.0 - 2026-08-26

**Cancelaciones ante el SAT y conciliación de timbrado (fix-15)**

- N-49: la cancelación de un complemento de pago (REP) ahora se aparta antes de llamar al PAC; dos clics simultáneos ya no mandan dos cancelaciones al SAT y el estado (motivo, sustitución y razón) queda guardado.
- N-27: los REP con cancelación pendiente ya se pueden refrescar desde el PAC y solo se marcan como cancelados cuando el SAT lo confirma.
- N-28: las notas de crédito usan el mismo apartado atómico antes de cancelar; si el PAC falla o no responde, el apartado se libera para permitir el reintento.
- N-29: la conciliación automática de timbrado aparta cada documento (facturas, REP y notas de crédito) para que dos ejecuciones del proceso no dupliquen consultas al PAC.
- N-32: no se puede sobrescribir un REP de proveedor ya validado sin confirmarlo explícitamente, y el UUID duplicado se rechaza con un mensaje claro.
- Base de datos: nuevas columnas de seguimiento de cancelación en pagos y restricción única del UUID de REP en pagos a proveedores.

## 7.346.0 - 2026-08-26

**Facturación recurrente, devoluciones y descargas de CFDI (fix-13 / fix-14)**

- N-7a: la última factura recurrente de un contrato se corta en la fecha de fin y se prorratea con la misma fórmula que el primer ciclo, en vez de cobrar el mes completo.
- N-7c: una tarifa pactada de $0 (cortesía) ya se respeta; antes se caía a la tarifa de lista del montacargas.
- N-12: la bolsa de horas del contrato se calcula con meses de calendario reales y prorrateo del remanente, en lugar de redondear días entre 30 (que inflaba la bolsa en meses de 31 días).
- N-13: la inspección de retorno registra los días de retraso y un cargo sugerido por devolución tardía (informativo, no se factura solo).
- N-35: el prellenado de daños en facturas usa el costo real cuando ya existe, no el estimado.
- N-8: el portal del cliente ya puede descargar sus CFDI: el rol cliente está autorizado con verificación de propiedad en facturas, notas de crédito y REP.
- N-9: los archivos de proveedores se abren con enlaces firmados de corta duración generados al momento, en vez de URLs de 5 años; se mantiene compatibilidad con los enlaces antiguos.
- N-10: si falta la llave del PAC, el retimbrado se pospone en vez de intentarse y arriesgar documentos duplicados.
- N-11: se puede volver a cancelar un CFDI rechazado o vencido, y las cancelaciones huérfanas de más de 72 horas se reinician.
- N-44: los nombres de archivo de descarga se sanitizan y las descargas de CFDI tienen límite de 30 solicitudes por minuto.
- N-37 descartado: la corrección propuesta para rentas ancladas al día 31 regresaba el comportamiento ya validado (31 ene → 1 mar) y encarecía el cobro; se conserva la lógica actual.
- Nueva prueba de humo SQL: supabase/tests/r_fix13_devoluciones_smoke.sql.

## 7.345.0 - 2026-08-26

**Integridad de estatus de unidades rentadas (N-6, N-38, N-39, N-41, N-42)**

- N-6: una unidad con renta vencida sin devolución registrada ya no se puede reservar ni aparece como disponible; antes sólo se revisaba el traslape de fechas.
- N-41: cancelar/eliminar otra reserva y la sincronización de flota ya no bajan a "disponible" una unidad que sigue con el cliente.
- N-42: cualquier salida de "rentada" (disponible, mantenimiento, fuera de servicio, vendida, baja) exige devolución registrada; se exime el flujo interno (`app.forklift_rpc`).
- N-38: la inspección de devolución bloquea la fila (`FOR UPDATE`), libera sólo si la unidad seguía rentada y registra bitácora sólo si hubo cambio.
- N-39: la entrega completada promueve a "rentada" únicamente desde "disponible" y registra el estatus previo real.
- Nueva prueba: `supabase/tests/r_fix12_unidades_smoke.sql`.

## 7.344.0 - 2026-08-26


**Conciliación bancaria: tipo de cambio, validación de signo y deduplicación de movimientos (N-4, N-5, N-23, N-24, N-25)**

- N-4: al confirmar una conciliación el importe del pago se convierte a la moneda de la cuenta bancaria; antes se comparaba en crudo y los pagos en moneda extranjera se rechazaban.
- N-5: los candidatos de pago a proveedor se convierten con el tipo de cambio de la factura, igual que el emparejamiento automático.
- N-25: un cargo del banco sólo puede conciliarse con un pago a proveedor y un depósito sólo con un cobro de cliente.
- N-23: el hash de deduplicación incluye la posición de la línea en el archivo (`bank_statement_lines.line_seq`), para no perder movimientos idénticos.
- N-24: las importaciones fallidas o sin movimientos nuevos limpian líneas y encabezado.
- Nuevas pruebas: `bankLineHash.test.ts` y `supabase/tests/r_fix11_conciliacion_smoke.sql`.

## 7.343.0 - 2026-08-26

**Reverso de pagos a proveedor, facturas acreditadas y criterio único de notas de crédito (N-1, N-2, N-3, N-21, N-33)**

- N-3: al eliminar o reversar un pago de una factura de proveedor pagada, el sistema ya puede recalcular su estado a "parcial"; el candado de transiciones de estado todavía la dejaba atorada.
- N-1: una factura cubierta sólo con notas de crédito ya no se marca como "pagada"; se requiere al menos un pago real del cliente.
- N-21: la base de datos usa el mismo criterio que la pantalla para las notas de crédito que descuentan saldo (timbradas, no canceladas y sin cancelación aceptada).
- N-33: el tipo de cambio sólo queda bloqueado si la factura está timbrada o si algún pago tiene REP timbrado.
- N-2: la exigencia de cliente se revisa únicamente al salir de borrador, no en cada actualización interna de estado.
- Nueva prueba de humo SQL (`supabase/tests/r_fix10_finanzas_smoke.sql`).

## 7.342.3 - 2026-08-26

**Datos de prueba con fecha de Monterrey y más cobertura en facturación**

- Los datos de prueba automatizados se fechan con el día vigente en Monterrey; antes usaban la fecha UTC y tras las 18:00 locales la factura quedaba "emitida mañana", lo que hacía que registrar un pago fuera rechazado.
- Nuevas pruebas para catálogos de métodos de pago, motivos de nota de crédito, topes de acreditación y claves de consulta de facturas.

## 7.342.0 - 2026-08-25

**Factura sin cliente bloqueada, notas de crédito sin borradores huérfanos y XML validado (L-1, L-3, L-8, M-17a)**

- L-1: una factura puede guardarse como borrador sin cliente, pero al pasar a cualquier otro estado el sistema exige que tenga cliente asignado y lo avisa con un mensaje claro.
- L-3: si falla el timbrado de una nota de crédito recién creada, el borrador se elimina automáticamente para no dejar registros huérfanos ni consumir folios.
- L-8: los complementos de pago de proveedor se rechazan si el XML viene truncado o con etiquetas desbalanceadas, en vez de leerse a medias.
- M-17a: se agrega un archivo de datos iniciales de demostración para entornos locales y de pruebas.

## 7.336.0 - 2026-08-25

**Reportes financieros con notas de crédito, cobros reales y control de tipo de cambio**

- H-1: el reporte de ingresos por mes descuenta las notas de crédito timbradas y calcula lo cobrado con los pagos reales en lugar del estado de la factura.
- H-2: las facturas en divisa sin tipo de cambio ya no se suman 1 a 1 como pesos; quedan fuera de los totales y se muestra un aviso con cuántas son en Ingresos, Antigüedad de saldos y Pronóstico de cobranza.
- H-2: en el detalle de antigüedad esas facturas se marcan como 'Sin T.C.' para identificarlas y capturarles el tipo de cambio.
- H-3: la utilidad por modelo usa el subtotal sin IVA, deduce notas de crédito y considera las facturas ligadas por el puente de reservas.
- H-4 y M-5: el estado de resultados prorratea la depreciación a 48 meses y la base de efectivo usa la fecha real de los pagos.
- Nuevas pruebas de conversión a MXN para evitar que vuelva la mezcla de monedas en los agregados.

## 7.334.0 - 2026-08-25

**Notas de crédito topadas por complementos de pago (REP)**

- H-5: el máximo acreditable de una factura ahora descuenta los pagos respaldados por un complemento de pago (REP) timbrado y vigente, tanto en la interfaz como en base de datos.
- Los pagos sin complemento timbrado (facturas PUE o capturas internas) y los complementos ya cancelados no limitan la nota de crédito.
- La tarjeta de notas de crédito muestra el desglose del tope (total, notas previas, importe con REP vigente) y lista los complementos que hay que cancelar primero, advirtiendo que el SAT puede tardar hasta 72 horas.
- Cuando hay cobros sin complemento vigente se avisa que la nota de crédito dejará saldo a favor del cliente.
- Nuevas pruebas de máximo acreditable y de pagos con REP, más suite de humo SQL h5_credit_note_rep_smoke.sql.

## 7.333.0 - 2026-08-25

**Timbrado con IVA por línea y candados de integridad fiscal**

- C-1: el timbrado envía a Facturapi la tasa de IVA de cada partida (0%, 8%, 16% o exenta) en lugar de la tasa global de la factura.
- C-1: si el total timbrado difiere del total de la factura por más de un centavo, la factura queda en estado de error y el timbrado responde con falla, pero se conservan el folio fiscal, el XML y el ID de Facturapi para poder cancelar el CFDI.
- C-2: una factura timbrada sin cancelación aceptada ya no permite editar partidas, subtotal, impuestos, tasa, total ni fecha de emisión.
- H-7: una cuenta por pagar en estado pagado con pagos registrados no puede cambiar de estado hasta reversar esos pagos.
- H-5: se conserva el tope de notas de crédito contra el total de la factura (opción B); no se restringen las notas de crédito por devolución sobre facturas ya cobradas.
- H-6: no se aplicó el índice único de factura manual por reserva; se documentó en docs/audits/h6-facturas-manuales-duplicadas-2026-08-25.md que la regla rompería la facturación mensual recurrente.

## 7.331.1 - 2026-08-16

**Arreglar la página de Historial de cambios**

- 27 entradas sin `type` rompían la validación y dejaban /changelog con "No se pudo cargar la información".
- Detalles normalizados a `description` + `changes` (lista de textos).
- El build ahora valida todo el historial para evitar recaídas.

## 7.331.0 - 2026-08-16

**Auditoría v2: invitaciones de cliente, fechas por teclado y resumen de contrato**

- Invitaciones al portal idempotentes (ya no chocan con el disparador `handle_new_user` ni borran la cuenta).
- Resumen financiero de contratos: atribución/prorrateo de facturas que cubren varias reservas.
- Campo de fecha con teclado: respeta fechas bloqueadas y avisa de capturas incompletas.
- Pivote de reservas facturadas paginado y refrescado al cancelar un CFDI.

## 7.330.3 - 2026-08-16

**Restaurar package.json y lockfile**
- El archivo package.json y el lockfile quedaron vacíos/perdidos en el último commit, lo que rompía la compilación con 'Script not found build:dev'. Se restauraron ambos desde la última versión válida del historial y se reinstalaron las dependencias; la compilación vuelve a funcionar.

## 7.330.2 - 2026-08-15

**Verificación paquete sprints_pulido (reentrega)**
- Se revisó de nuevo el paquete de pulido visual (sprints V1, V2 y V3): los 24 arreglos ya estaban aplicados en la app desde la versión 7.330.0. El único parche restante creaba pruebas del campo de moneda importándolo desde el archivo antiguo; esas pruebas ya existen apuntando al módulo correcto, así que se descartó. Suite completa en verde: 1860 pruebas. Sin cambios de comportamiento.

## 7.330.1 - 2026-08-14

**Verificación paquete sprints_bajos (reentrega)**
- Se revisó nuevamente el paquete de sprints B1, B2 y B3 recibido: 29 de 30 arreglos ya estaban aplicados en la app (v7.327.0 a v7.329.1), incluidos el costo real de daños en $0, las columnas acotadas de pagos del portal y la pantalla de 'Factura no encontrada' con encabezado. El único pendiente, quitar el archivo .env del control de versiones, no aplica: ese archivo lo administra la plataforma y sólo contiene la dirección del backend y la llave pública protegida por RLS. Sin cambios de comportamiento.

## 7.330.0 - 2026-08-14

**Pulido visual — Sprints V1, V2 y V3**
- Pulido visual en toda la app: la paginación indica el rango visible ('26–50 de 312'), las pantallas vacías de daños, entregas, devoluciones e usuarios ofrecen un botón para crear el primer registro, y los esqueletos de carga replican el layout final (tablero, calendario, flujo de efectivo, permisos) sin brincos. Sidebar: atajo Ctrl+B documentado, contadores con tope '99+', el grupo activo ya responde al colapsar y el creador rápido muestra esqueleto mientras cargan permisos. Los campos obligatorios de fecha usan la misma marca que el resto de formularios y el subidor de imágenes es accesible por teclado. Consistencia global: puntos suspensivos tipográficos, colores desde tokens del tema, un solo proveedor de tooltips (300 ms), alto de pantalla 100dvh en móvil, montos con tipografía tabular y el campo de moneda ahora muestra separador de miles y entiende '1,234.50' al pegarlo.

## 7.329.1 - 2026-08-14

**Sprint B3 — Detalles de interfaz**
- En pólizas de mantenimiento, una unidad se considera rentada por su reserva vigente y no por el estatus guardado, igual que en Flota. El diálogo de cambio de contraseña pide mínimo 8 caracteres en todos los campos y se limpia al cerrarse. La paginación anuncia 'Paginación' en español para lectores de pantalla. La pantalla de 'Factura no encontrada' del portal ahora tiene encabezado y botón para volver a facturas. El formulario de refacciones limita la cantidad a las existencias reales (antes permitía hasta 999 con inventario en cero). Se eliminó un componente de barra de herramientas sin uso.

## 7.329.0 - 2026-08-14

**Sprint B2 — Mutaciones, formularios y consultas más firmes**
- Editar un proveedor ahora falla con mensaje claro si el registro fue borrado o no existe, en vez de reportar éxito silencioso, y el formulario limita la longitud de nombre, contacto, teléfono, sitio, dirección y notas. Si falla el registro de un reporte de feedback, su captura de pantalla se borra del almacenamiento. Las ligas firmadas de archivos se refrescan antes de vencer. Buscar '%' o '_' en el feed de actividad ya busca esos caracteres literalmente. Los PDF liberan su enlace temporal un segundo después de abrirse (evita el error en Firefox). La fecha del servidor se refresca cada minuto para no quedarse en el día anterior cerca de medianoche. Al cerrar una página, los atajos de teclado vuelven a los de la pantalla anterior. Los filtros de fecha de auditoría ignoran fechas inválidas. La nota extra al cerrar un prospecto como perdido admite hasta 2000 caracteres y los pagos del portal piden sólo las columnas necesarias.

## 7.326.1 - 2026-08-14

**Mantenimiento — Cobertura de pruebas de los sprints M1-M3**
- Se agregaron 22 pruebas para los seis arreglos que habían quedado sin red de seguridad: totales de factura con partidas exentas, IVA por línea en notas de crédito, límite de uso de la generación de manuales con IA, vigencia de cotizaciones en horario de Monterrey, tope de monto al editar un pago y la unión sin duplicados de facturas en el resumen del contrato. Suite completa en verde: 1837 pruebas, sin errores de tipos ni advertencias de lint.

## 7.326.0 - 2026-08-14

**Mejoras — Sprint M3 — Robustez y consistencia**
- Editar un pago ya valida el tope contra el saldo y bloquea monto y fecha cuando el complemento ya está timbrado. El resumen financiero del contrato incluye las reservas ligadas por la tabla de relación. Las estadísticas del tablero salieron de la caché guardada en el navegador. Un daño reportado puede marcarse reparado sin orden de trabajo. La conciliación bancaria elige la tabla destino por el tipo de candidato y no por el signo del movimiento. No se puede cambiar la moneda de una cuenta con movimientos importados, y el selector de entregas sólo ofrece reservas confirmadas.

## 7.325.0 - 2026-08-14

**Mejoras — Sprint M2 — Backend y portal de clientes**
- Invitar a un cliente ahora deshace la cuenta creada si falla cualquier paso, en vez de dejar usuarios a medias. Cancelar un complemento de pago ante una caída del PAC entra a la cola de reintentos. Las funciones de inteligencia artificial y de validación de comprobantes ganaron límite de uso y tope de tamaño de archivo, y los errores internos dejaron de exponer detalles técnicos. El rol despachador ya no ve facturas, pagos ni gastos de operación, como declara la matriz de roles. En el portal, un error de red al pagar muestra un estado con reintento en vez de 'cuenta no configurada', la vigencia de las cotizaciones se evalúa en horario de Monterrey y el formulario de reporte de transferencia valida longitudes y rango de fecha.

## 7.324.0 - 2026-08-14

**Mejoras — Sprint M1 — Dinero y documentos**
- Las extensiones de renta ahora respetan las tarifas diaria y semanal pactadas en la reserva (antes sólo la mensual). Una renta que arranca el 29-31 y termina en un mes corto ya no cobra un día extra (31-ene → 28-feb = un mes exacto). El resumen de totales del formulario de factura considera las líneas exentas y las tasas por partida, así que lo que ves en pantalla es lo que se guarda. Las notas de crédito calculan el IVA partida por partida. Al convertir una cotización ya no se borran las tarifas de la reserva con ceros. Las facturas de proveedor rechazan descuentos mayores al subtotal y los pagos a proveedores ya no aceptan fecha futura.

## 7.323.1 - 2026-08-14

**Correcciones — Fallas de CI (knip y E2E del selector de rango)**
- `src/lib/errors/index.ts` dejó de re-exportar `translatePgError`, `CONSTRAINT_MESSAGES` y `SQLSTATE_MESSAGES`: knip los marcaba como exports sin uso porque los consumidores importan directo del catálogo.
- `tests/e2e/daterange-picker.spec.ts` localiza el trigger por `aria-label` "Abrir calendario…": tras DatePickerMx el botón es de ícono y ya no contiene el texto del rango.

## 7.323.0 - 2026-08-14

**Mejoras — Errores de servidor y SAT traducidos + toasts sin duplicados**
- Catálogo de errores de Postgres/PostgREST en tres niveles: nombre de restricción, SQLSTATE y patrones de texto; reemplaza los mensajes genéricos por instrucciones accionables en español.
- Errores P0001 (reglas de negocio del backend) se muestran tal cual porque ya vienen redactados para el usuario.
- Rechazos del SAT/FacturAPI clasificados por código numérico (301, 302, 304, 307, 402, 404) sin confundir montos con códigos; el reporte copiable conserva la respuesta completa del PAC.
- Timbrado de CFDI notifica con contexto fiscal (folio, RFC receptor, UUID, código SAT) en el diálogo de detalles.
- Toasts deduplicados por contenido o `dedupeKey`: los clics repetidos reemplazan el toast en vez de apilarlo.

## 7.322.1 - 2026-08-14

**Mantenimiento — Borrador de plan fuera de Git**
- Los commits titulados "Update plan" contenían un solo archivo: `.lovable/plan.md`, el borrador que se reescribe en cada iteración del modo plan.
- Se agregó `.lovable/plan.md` a `.gitignore` para dejar de versionarlo.
- Los planes aprobados se siguen archivando en `.lovable/plan/` y permanecen versionados en el repositorio.

## 7.320.1 - 2026-08-14

**Mejoras — Lote 3 de librerías: jest-dom 7 aplicado, jsdom 30 descartado**
- Herramientas de prueba: @testing-library/jest-dom actualizado de 6.9.1 a 7.0.1; los matchers en uso siguen soportados.
- jsdom 30 se probó y se descartó: rompe la generación de PDFs en pruebas (error de estilos con React 19). Se mantiene jsdom 26.1.0.
- @types/node se queda en 24 mientras el runtime de CI siga en Node 24.
- Verificación: typecheck OK, ESLint 0 warnings, 1698/1698 pruebas verdes, build OK.

## 7.320.0 - 2026-08-14

**Mejoras — Actualización de librerías: 14 paquetes al día (parches y menores)**
- Actualizadas dependencias sin cambios de comportamiento: @supabase/supabase-js 2.112.3, @sentry/react 10.70.0, react-hook-form 7.85.0, @hookform/resolvers 5.8.0, @react-pdf/renderer 4.6.1, lucide-react 1.31.0, papaparse 5.6.0.
- Parches de seguridad y estabilidad: dompurify 3.4.13, marked 18.0.9, sonner 2.0.8, @tanstack/react-virtual 3.14.9.
- Herramientas de desarrollo: knip 6.32.2, typescript-eslint 8.67.0, rollup-plugin-visualizer 7.1.1.
- Se documentó en docs/dependency-update-audit-2026-08-14.md por qué se aplazan TypeScript 7, react-dropzone 20, @tanstack/react-table 9, jsdom 30 y @types/node 26.
- Verificación: typecheck OK, ESLint 0 warnings, 1698/1698 pruebas verdes, build OK.

## 7.319.0 - 2026-08-14

**Mejoras — Cierre de auditoría: fecha del servidor en flota, orden del CRM y conciliación multimoneda**
- El cálculo de disponibilidad de flota (calendario, lista de equipos, flota y detalle de unidad) ahora usa la fecha del servidor en hora de Monterrey, no el reloj de la computadora.
- El Kanban de CRM ya no puede tener dos prospectos en la misma posición: se normalizaron los casos existentes y la base de datos lo impide; si ocurre una carrera, la app reintenta sola.
- La conciliación bancaria automática ahora empareja pagos en otra moneda usando su tipo de cambio, igual que las sugerencias manuales.
- Cancelar en el diálogo de comprobante de pago a proveedor y en el borrado de bitácora ahora avisa de cambios sin guardar.
- El texto de ayuda del logo ya no ofrece SVG, que no está permitido.

## 7.318.3 - 2026-08-14

**Mejoras — Etiquetas de IA en español en el detalle de feedback**
- El chip y el bloque de razonamiento del clasificador ahora dicen "IA" en vez de "AI".

## 7.318.2 - 2026-08-14

**Mejoras — Cancelar en diálogos: mismo aviso de cambios sin guardar en toda la app**
- Los botones Cancelar de reservas, operadores, mecánicos, modelos de equipo y políticas de mantenimiento ahora piden confirmación si hay cambios sin guardar.
- Esos mismos diálogos ya no se pueden cerrar a media operación mientras se guarda.

## 7.318.1 - 2026-08-14

**Correcciones — Facturación de extensiones: candado a prueba de doble clic y pestañas**
- Ahora la base de datos impide de raíz que dos facturas queden ligadas a la misma extensión de reserva, incluso desde dos pestañas al mismo tiempo.
- Si una extensión ya fue facturada, el aviso llega como error de negocio con mensaje claro en vez de un error técnico de base de datos.
- Se eliminó un índice duplicado en extensiones de reserva.

## 7.318.0 - 2026-08-14

**Mejoras — Venta y baja de unidades: solo se bloquean con renta realmente abierta**
- Una unidad solo se considera rentada si su entrega está completada y aún no se registra la devolución; antes bastaba una reserva confirmada, aunque ya se hubiera devuelto.
- La misma regla aplica ahora en el cambio de estado desde la app, en la asignación a cotizaciones de venta y en cambios directos en base de datos.
- El mensaje de error es claro: pide completar la devolución antes de vender o dar de baja la unidad.
- Se agregaron pruebas de las máquinas de estado: contrato completado final, factura borrador que no puede vencer y cuenta por pagar con pagos que no se puede cancelar.

## 7.317.4 - 2026-08-14

**Correcciones — Pruebas de los candados de dinero (notas de crédito, sobrepago y fechas de Monterrey)**
- Se agregaron pruebas automáticas que verifican que una nota de crédito timbrada por el total deja la factura como pagada.
- Se verifican los bloqueos de sobrepago y de pagos en moneda distinta a la factura.
- Se comprueba que borrar el único pago de una factura vencida la deja en vencida y no en enviada.
- Se comprueba que una cuenta por pagar que vence mañana (hora Monterrey) no se marca vencida hoy.

## 7.317.3 - 2026-08-14

**Correcciones — Fechas de negocio en hora de Monterrey y pruebas SQL en verde**
- Catorce reglas de negocio (facturas de proveedor, cotizaciones, flota, panel y seguros) usan la fecha de Monterrey en el historial de cambios, igual que en producción.
- Se restauró la tarea diaria que marca como rentadas las unidades cuya reserva inicia hoy.
- Las pruebas automáticas de base de datos r4 y r9 vuelven a pasar en integración continua.

## 7.317.2 - 2026-08-14

**Correcciones — Limpieza de código: revisión automática de calidad en verde**
- Se simplificaron las reglas de acciones de facturas separando el cálculo de cobrabilidad.
- Los formularios de factura y el detalle de cotización se dividieron en funciones más pequeñas y legibles.
- El prellenado de facturación de extensiones se reorganizó en pasos claros.
- Se eliminaron dos definiciones de estados de contrato que ya no se usaban.
- Se ordenaron importaciones y se estabilizó una prueba automatizada de acciones fiscales.

## 7.317.1 - 2026-08-14

**Correcciones — Arreglos de CI: lint, archivo sin uso y prueba E2E inestable**
- Se eliminó un tipo permisivo en la creación de prospectos que rompía la revisión de código.
- Se borró un archivo de validación de notas de crédito que ya no se usaba.
- La prueba automatizada de alta de clientes ya no falla cuando queda un registro residual con el mismo nombre.

## 7.317.0 - 2026-08-14

**Correcciones — Cierre de sprints: horas extra en devoluciones y pruebas de cierre**
- La inspección de devolución calcula el exceso de horas contra el contrato y sugiere el cargo correspondiente.
- El detalle de la devolución muestra un aviso con las horas excedidas y el monto sugerido para facturación manual.
- Se agregaron pruebas del bloqueo de pagos con cancelación pendiente ante el SAT.
- Se agregaron pruebas de los límites del logo de empresa (2 MB, PNG/JPG/WebP) y de los estados de cuenta (10 MB, 50,000 movimientos).
- Se agregó una suite de verificación en base de datos para los arreglos de moneda de pagos, sobrepagos y horas extra.

## 7.316.0 - 2026-08-14

**Correcciones — Sprint 10: accesibilidad y pulido visual**
- Se agregaron esqueletos de carga para evitar saltos de contenido.
- Los semáforos de flujo de efectivo tienen descripción en español para lectores de pantalla.
- Controles de línea de tiempo y tablas con nombres accesibles.
- Las tablas del portal de clientes usan el mismo componente compartido del resto de la app.

## 7.315.0 - 2026-08-14

**Correcciones — Sprint 9: seguridad de funciones, cargas y datos personales**
- Las llamadas a la IA tienen límite de 20 segundos y avisan cuando el servicio no responde.
- El logo de la empresa solo acepta PNG, JPG o WebP hasta 2 MB.
- Los registros técnicos de invitación y restablecimiento de contraseña ya no guardan datos personales.
- La clasificación automática de reportes está protegida contra instrucciones maliciosas en el texto del usuario.
- Todas las funciones llamadas desde la app exigen sesión válida, y los enlaces a sitios de proveedores se fuerzan a HTTPS.

## 7.314.0 - 2026-08-14

**Correcciones — Sprint 8: reglas de facturación en notas de crédito y extensiones**
- Cada línea de una nota de crédito tiene tope por cantidad y precio facturado, y ahora se muestra el máximo permitido debajo de cada campo.
- No se pueden registrar pagos de facturas con cancelación pendiente ante el SAT.
- La vista previa de extensión cobra solo el periodo extendido y coincide centavo a centavo con la factura generada.
- Una extensión de 28 o 29 días se prorratea en vez de cobrar un mes completo; un mes calendario cerrado sí se cobra como mes.

## 7.313.0 - 2026-08-14

**Correcciones — Sprint 7: consistencia de formularios y kanban de CRM**
- Todos los diálogos usan el mismo botón de Cancelar, con el mismo comportamiento (~26 pantallas).
- El diálogo de reportar daño ya no duplica su contenedor, evitando saltos visuales.
- Mover tarjetas en el kanban de CRM usa una operación atómica en la base: dos usuarios simultáneos ya no desordenan las etapas.

## 7.312.0 - 2026-08-14

**Correcciones — Sprint 6: conciliación bancaria y flujo de efectivo**
- Los estados de cuenta se identifican con huella digital (SHA-256) para evitar cargar dos veces el mismo archivo.
- Límites de carga: máximo 10 MB y 50,000 líneas por archivo, con aviso claro al usuario.
- Las sugerencias de conciliación consideran la moneda y descartan candidatos sin tipo de cambio registrado.
- El flujo de efectivo calcula los saldos en la moneda del documento.

## 7.311.0 - 2026-08-14

**Correcciones — Sprint 5: integridad de datos en daños, cotizaciones y comprobantes**
- El monto de la factura por daños se toma del reporte guardado en la base, no del enlace, así nadie puede alterarlo desde la URL.
- Si falla la conversión de una cotización a reserva, ahora se muestra el error real en pantalla en vez de fallar en silencio.
- Los comprobantes de pago se validan (tipo y tamaño de archivo) antes de subirse.
- Una extensión de reserva solo puede facturarse una vez: la base de datos lo impide con un índice único.

## 7.310.0 - 2026-08-14

**Correcciones — Sprint 4: máquinas de estado (contratos, facturas, CxP y unidades)**
- Contratos: `completed` es terminal en `stateMachines.ts` y en `enforce_signed_contract_lock` (solo `service_role` escapa); se suma a `CONTRACT_LOCKED_STATUSES`, congelando tarifas, depósito, fechas y términos.
- Facturas: se elimina `draft → overdue` en TS y en `validate_transition` (queda `['sent','cancelled']`); el marcado de vencidas solo opera sobre facturas ya enviadas.
- CxP: salir de `paid` en `supplier_bills` requiere `service_role` o cero `supplier_payments` ligados; si hay pagos, error "La cuenta tiene pagos registrados; elimina o reversa los pagos primero.".
- Flota: `rented → sold/retired` se bloquea si existe reserva confirmada con entrega completada y sin devolución; `useUpdateStatus` ahora muestra el mensaje del servidor en el toast.
- Tests: casos nuevos en `stateMachines.test.ts` y suite `supabase/tests/sprint4_state_machines_smoke.sql`.

## 7.309.0 - 2026-08-14

**Correcciones — Sprint 3: triggers de dinero (NCs, saldos y zona horaria)**
- `sync_invoice_status_from_payments` ahora resta las notas de crédito timbradas: `balance = total - pagos - NCs`. Factura cubierta 100% por NC → `paid`, nunca `overdue`.
- Nuevo trigger `trg_sync_invoice_from_credit_notes` en `credit_notes` (INSERT/DELETE/UPDATE de status o total) que recalcula la factura ligada de inmediato.
- Rama sin abonos: la factura vuelve a `sent` u `overdue` comparando `due_date` contra `public.today_mty()` (hora de Monterrey) en vez de UTC.
- `enforce_payment_within_invoice_total` considera las NCs timbradas: el techo de pagos es `total - NCs`.
- `sync_invoice_status_from_credit_notes` con `EXECUTE` revocado a `anon` y `authenticated`.

## 7.308.0 - 2026-08-14

**Correcciones — Sprint 2: fronteras fiscales del timbrado CFDI (SAT)**
- Timbrado: factura en moneda != MXN sin tipo de cambio válido → 422 con mensaje claro, sin llamar al PAC (se elimina el fallback `|| 1`).
- Descuentos: el schema del formulario rechaza < 0 y > 100%; `stamp-cfdi` capea el porcentaje en [0, 100] con la misma regla que `applyDiscountToBase`.
- IVA por línea: `computeTotals` grava partida por partida respetando `objeto_imp` (las líneas 01 no generan IVA), igual que el payload de timbrado.
- Cancelación: `cancel-cfdi` hace claim atómico `none` → `pending` antes de llamar al SAT; la segunda petición concurrente recibe 409.
- Tests nuevos de totales: factura mixta 01+02, 100% exenta y normal.

## 7.307.9 - 2026-08-14

**Correcciones — Sprint 1: tres bugs bloqueantes de UI y arranque de sesión**
- Nueva cuenta bancaria: el formulario valida en `onChange`, así el botón de guardar se habilita al llenar los campos requeridos.
- Notas de crédito: el botón de eliminar borrador se deshabilita mientras corre la mutación (evita doble borrado).
- Auth: `getSession()` del bootstrap ahora tiene `.catch`, un fallo de red ya no deja la app cargando.

## 7.307.8 - 2026-08-13

**Infraestructura — CI: el paso de publicación de smoke ya no tumba el job**
- El paso `Publish SQL smoke results` usaba el default `fail_on_failure: true` del wrapper, así que cualquier fallo en el reporte JUnit de smoke (informativo, con `continue-on-error: true`) volvía a marcar el job como fallido, contradiciendo el diseño no-fatal del smoke.
- Ahora `fail_on_failure: false` y `require_tests: false` en la publicación de smoke: el check se publica para revisión pero no puede fallar el job. El paso de RLS DB conserva `fail_on_failure: true` (los fallos de RLS sí deben romper el gate).

## 7.307.7 - 2026-08-13

**Infraestructura — CI: última suite RLS en verde y smoke SQL tolerante a base vacía**
- `payments_portal`: la factura del fixture pasa a $1,000 para que el intento de pago del cliente choque contra RLS y no contra el trigger de saldo (`enforce_payment_balance`).
- `r3_smoke` y `r4_smoke`: `expect_error` ahora reporta SKIP cuando la sentencia afecta 0 filas — en CI la base se reconstruye sin datos y los guards no tenían nada que bloquear (falsos FALLO).
- `r4_smoke`: corregido `RAISE` con `%%` (error 42601 que abortaba la transacción y tumbaba el resto del archivo) y DB4-02a se salta cuando no hay JWT, porque el guard delega en `service_role`.
- `r9_smoke`: R9-02 ahora nombra las funciones que usan `CURRENT_DATE` en vez de fallar sin pistas.

## 7.307.6 - 2026-08-13

**Infraestructura — CI: partidas obligatorias en el fixture de pagos del portal**
- `payments_portal`: el trigger `validate_invoice_line_items_signs` exige al menos una partida en facturas fuera de borrador; el fixture ahora incluye `line_items` con importe cuadrado al subtotal.
- El paso de smoke SQL corre con `if: always()` para que genere su reporte JUnit aunque falle la suite RLS previa.
- Los pasos de publicación de resultados sólo se ejecutan si el archivo JUnit existe, evitando el error "No test results found".

## 7.307.5 - 2026-08-13

**Infraestructura — CI: últimas 5 suites RLS en verde y fix real de lectura de archivos del portal**
- `billing_secrets`: el fixture usaba columnas inexistentes (`key`/`value`); ahora usa `facturapi_live_key`.
- `maintenance_parts`: el alta del mecánico chocaba con el índice único log+refacción; se agregó una segunda refacción al fixture.
- `notifications`: la baja de una notificación ajena no borra filas (RLS la oculta); la suite ahora valida `ROW_COUNT = 0` en vez de la existencia de la fila.
- `payments_portal`: las facturas del fixture pasan a estado `sent`, porque el trigger bloquea pagos sobre borradores.
- Bug real detectado por la suite de storage: la policy del bucket `documents` consultaba `public.documents` dentro del USING, y las propias reglas de esa tabla bloqueaban la subconsulta, así que el cliente del portal veía cero archivos. Se movió la verificación a la función `customer_can_read_document_object` (SECURITY DEFINER, sólo `authenticated`) y se recreó la policy sin cambiar el alcance.

## 7.307.4 - 2026-08-13

**Infraestructura — CI: las suites RLS ya corren contra una base reconstruida**
- Causa raíz de las 30 suites en rojo: al crear el usuario de prueba, el trigger `handle_new_user` ya le asigna el rol `customer`, y el índice único `user_roles_one_role_per_user` hacía que el `INSERT ... ON CONFLICT DO NOTHING` del rol de staff se descartara en silencio. Las suites ahora hacen upsert del rol.
- Fixtures corregidos: facturas con `subtotal`+`tax_amount` cuadrados, `documents.file_url`, `user_manual.content` como JSON, `customers.user_id`, UUID inválido en `supplier_payment_batch_items`, perfiles con upsert y variable fuera de alcance en `role_permissions`.
- `billing_secrets` acepta la denegación por falta de GRANT como válida.
- Migración de sincronía (idempotente, sin efecto en producción): crea `public.notifications` —existía en producción pero en ninguna migración— con sus GRANT/RLS, y elimina el trigger obsoleto `trg_validate_transition` sobre `deliveries` que revivía al aplicar el historial desde cero.

## 7.307.3 - 2026-08-13

**Infraestructura — CI: comentarios con `;` ya no parten los guards**
- El job `rls-db-tests` seguía fallando con `syntax error at or near "IF"` (42601): el splitter del CLI de Supabase no ignora los comentarios `--`, y un `;` dentro de un comentario de rollback partía a la mitad el bloque `DO $lgp_guard$`.
- `scripts/patch_legacy_migrations.py` ahora neutraliza los `;` de los comentarios que preceden a un guard y su propio splitter también ignora comentarios de línea.
- Producción no se toca: el parche sólo existe en la copia efímera del runner.

## 7.307.2 - 2026-08-13

**Infraestructura — CI: guards sin dollar-quoting anidado**
- El job `rls-db-tests` fallaba con `syntax error at or near "IF"` (42601): el splitter de statements del CLI de Supabase no empareja tags dollar-quoted anidados y partía los bloques `DO $lgp_guard$ ... EXECUTE $lgp$...$lgp$` por sus `;` internos.
- `scripts/patch_legacy_migrations.py` ahora genera el `EXECUTE` con un literal de comillas simples escapadas en vez de dollar-quoting anidado.
- Producción no se toca: el parche sólo existe en la copia efímera del runner.

## 7.307.1 - 2026-08-13

**Infraestructura — CI: migraciones aplicables desde cero**
- El job `rls-db-tests` fallaba al reconstruir la base desde cero: una migración intentaba crear una restricción única con el mismo nombre que un índice creado antes (error 42P07).
- `scripts/patch_legacy_migrations.py` (parche sólo en el runner) ahora amplía esos guards para revisar también índices/relaciones existentes, no sólo restricciones.
- Producción no se toca: las migraciones ya están aplicadas y el parche vive únicamente en la copia efímera del CI.

## 7.307.0 - 2026-08-13

**Facturación — extensiones de reserva**
- Nuevo botón "Facturar extensión" en el detalle de la reserva; factura sólo el tramo nuevo (`fin original + 1` … `nuevo fin`, inclusivo).
- `booking_extensions`: nuevas columnas `invoice_id` y `billed_at` + trigger que bloquea el doble cobro.
- Partidas calculadas con `calculateRentalCost` (mensual → semanal → diario), respetando la tarifa pactada en la reserva.
- `InvoiceForm` acepta `?extension_id=` y re-habilita la reserva en el selector aunque el período original ya esté facturado.
- El modal de recurrentes aclara su alcance (sólo mensuales recurrentes).

## 7.306.7 - 2026-08-12

**Infraestructura — CI sin `supabase db lint`**
- El paso fallaba en todos los runs con `Cannot find project ref`: `supabase db lint` requiere una DB (linked o local), no lintea archivos.
- Eliminado también el `Setup Supabase CLI` del job; se conservan los guards de GRANT/RLS/POLICY/search_path sobre migraciones nuevas.
- La validación real contra DB limpia la sigue haciendo `rls-db-tests.yml`.

## 7.306.6 - 2026-08-12

**Infraestructura — lint de migraciones dentro del CI**
- `ci.yml`: nuevo job `Supabase migrations lint` (guards de GRANT/RLS/POLICY/search_path + `supabase db lint`), con `needs: changes` y filtro `migrations` (`supabase/migrations/**`, `scripts/lint-migrations.ts`).
- `ci-success`: el job se suma al gate único de branch protection.
- Eliminado `.github/workflows/supabase-lint.yml` (ya no hay lints fuera del CI).
- El paso solo lintea migraciones **nuevas o modificadas** (diff del PR o del push); en cron/manual no lintea nada. Lintear el histórico completo fallaba porque las migraciones antiguas reparten `GRANT`/RLS entre varios archivos.

## 7.306.3 - 2026-08-12

**Infraestructura — limpieza de workflows de andamiaje**
- Eliminados `release-drafter.yml` (+ `.github/release-drafter.yml`), `pr-title.yml`, `labeler.yml` (+ `.github/labeler.yml`) y `stale.yml`.
- `bundle-size.yml`: pasa a `workflow_dispatch` únicamente, con input opcional `base_ref`; el job de medición/comparación queda intacto.
- `changelog-check.yml`: se elimina el paso que comparaba contra GitHub Releases.
- `ci.yml` y `dependabot.yml`: comentarios actualizados sin referencias a los workflows eliminados.

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
