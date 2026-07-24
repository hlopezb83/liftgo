## Alcance

Cerrar los DIFFs diferidos de la Auditoría de Tests v2 (los 1-8, 13, 15 ya se aplicaron en v7.220.0). Todo el trabajo son **tests nuevos o refactor de tests** — sin cambios de lógica de negocio, sin migraciones. Versión sugerida: **v7.221.0** (minor).

## DIFFs a ejecutar

### DIFF 9 · REP EquivalenciaDR + parcialidades + claim
Archivo: `supabase/functions/stamp-payment-complement/index_test.ts` (hoy solo cubre CORS/401).
- Refactor: usar patrón DI de `stamp-cfdi/handler_test.ts` con `facturapiMock` + `supabaseClientMock` compartidos.
- Casos: (a) pago en misma moneda que la factura ⇒ `related_documents[0].exchange === 1` aunque `invoice.tipo_cambio` tenga valor; (b) pago en moneda distinta ⇒ `exchange === invoice.tipo_cambio`; (c) parcialidad 2 con pago previo de 400 sobre 1000 ⇒ `installment=2`, `last_balance=600`; (d) segunda invocación concurrente con `rep_status='in_progress'` ⇒ 409 benigno, sin llamada al PAC.

Prerrequisito: si `index.ts` no expone un handler DI-able, extraer un `handler.ts` puro (mismo patrón que `stamp-cfdi/handler.ts` + `handler_test.ts`). Sin cambiar lógica.

### DIFF 10 · stamp-cfdi timeout ≠ error
Archivo: `supabase/functions/stamp-cfdi/handler_test.ts` (añadir 2 casos).
- Timeout del PAC ⇒ ningún update lleva `status='error'`; al menos uno mantiene `status='stamping'` para que reconcile lo recoja.
- Claim atómico perdido (update condicional devuelve 0 filas) ⇒ `facturapiMock.invoices.create` no invocado, respuesta 409, sin `notifyError`.

Si el mock actual no evalúa filtros `eq/in` en el claim, extraer la decisión de claim a función pura y testearla directo (mismo patrón que DIFF 2 · `decisions.ts`).

### DIFF 11 · Portal saldo USD → MXN
Archivo: `src/features/portal/__tests__/portalBalance.test.ts` (hoy es réplica TS de la vista, sin caso USD).
- Reemplazar por test del hook real (`usePortalExtras` o el que agrega saldo) con `createSupabaseChainMock`.
- Casos: factura USD balance 1000 + `tipo_cambio=17.5` ⇒ total mostrado `$17,500.00 MXN`; `tipo_cambio=null` ⇒ fallback documentado por `toMxn` (assert el valor real, no colapsa a 0).
- No modificar el e2e portal.spec en este PR (deferir a cuando el seed tenga factura USD).

### DIFF 12 · Starters de features en 0
Nuevos hooks tests con harness `usePayments.rls.test.ts` (queryClient wrapper + `createSupabaseChainMock`):
- `src/features/users/hooks/__tests__/useRoleChange.test.tsx` — cambio de rol invalida cache de permisos; guard último-admin.
- `src/features/returns/hooks/__tests__/useReturnInspection.test.tsx` — inspección completada actualiza booking/forklift/genera cargo; segundo submit idempotente; horómetro entrada < salida ⇒ error.
- `src/features/maintenance/hooks/__tests__/useMaintenanceKanban.test.tsx` — cerrar OT persiste `work_status='closed'`; recurrente dispara `generate_recurring_maintenance`.
- `src/features/calendar/lib/__tests__/ganttSegments.test.ts` — bookings consecutivas mismo día no solapan segmentos.

Si algún hook no existe con la forma esperada, crear el test contra el hook público real (`useUserManagement`, `useReturnInspections`, etc.) y ajustar el nombre del archivo.

### DIFF 14 · data-testid en flujos de dinero
5 puntos: `invoice-register-payment`, `invoice-stamp-cfdi`, `payment-submit`, `status-tab-{value}`, `quote-download-pdf`.
- Añadir el atributo `data-testid` en los 5 componentes correspondientes (cambio mínimo de markup).
- Migrar los selectores en `tests/e2e/full-flow.spec.ts:29`, `invoice-payment.spec.ts:19`, `quote-pdf.spec.ts:23`, `filters-invoices.spec.ts:17-20` a `getByTestId`. El resto de selectores por copy queda.

### DIFF 16 · Cobertura Deno crítica
- `supabase/functions/validate-receptor-tax-info/handler_test.ts` (nuevo) — RFC válido, RFC inválido, PAC caído ⇒ 502 sin cachear, timeout con `withTimeout`.
- `supabase/functions/_shared/cronAuth_test.ts` (nuevo) — token válido, inválido, ausente; smoke de comparación timing-safe (mismos tiempos ± ruido para tokens de igual longitud).
- `supabase/functions/_shared/authWithDeps_test.ts` (nuevo) — 401 sin JWT, 403 con rol insuficiente, happy path con DI.

## Verificación

1. `bun run test` — thresholds actuales de v7.220.0 deben seguir verdes (14/10/14/12.5 global + 60/55 dominio fiscal).
2. `supabase--test_edge_functions` para los 3 nuevos suites Deno + REP + stamp-cfdi.
3. `bunx playwright test --project=chromium` acotado a los 4 specs modificados.
4. Log del job `edge-functions` en CI muestra los `handler_test.ts` corriendo (ya habilitado en DIFF 1).

## Cierre

- Nueva entrada `public/changelog/v7.221.0.json` + índice.
- Bump `package.json` + `public/version.json` a `7.221.0`.
- Sin migraciones, sin cambios de UI de producción (solo `data-testid` invisibles).
