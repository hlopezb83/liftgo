# 🔍 Auditoría CI + Testing — LiftGo

Resultado de 4 subagentes especializados (CI pipeline, Vitest, Playwright E2E, Edge Functions Deno).

---

## 📊 Resumen ejecutivo

```
CI pipeline       : 21 hallazgos (3 críticos, 5 altos, 8 medios, 5 bajos)
Vitest            : 19 hallazgos (4 críticos, 5 altos, 6 medios, 4 bajos)
Playwright E2E    : 13 hallazgos (3 P0, 5 P1, 5 P2)
Edge Functions    : 18 recomendaciones (3 críticos, 4 altos sprint, 3 altos siguiente)
─────────────────────────────────────────────────────────────────────
TOTAL            : ~71 hallazgos
```

**Estado general**
- ✅ Buena arquitectura base: sharding E2E, fixture seed/teardown con scope, JUnit + artifacts, separación de jobs.
- 🔴 Confianza falsa: varios tests pasan independientemente del código real (flow tests con mocks, `test.skip(true)` en E2E, smoke tests de Edge Functions sin validar lógica).
- 🔴 Riesgos de seguridad: anon key de Supabase **hardcodeada** en `seed.ts` y URL de producción como fallback en `test-helpers.ts`.
- 🔴 Tests Edge Functions tocan **producción real** si faltan env vars en CI.

---

## 🔴 Hallazgos Críticos (bloquear próximo merge)

### CI / Seguridad
1. **Anon key Supabase hardcodeada** en `tests/e2e/fixtures/seed.ts:11-14` (`PUBLISHABLE_FALLBACK`).
2. **URL de producción hardcodeada** en `supabase/functions/_shared/test-helpers.ts:4-8` — si `SUPABASE_URL` no está en CI, los tests Deno golpean producción real.
3. **Variables `VITE_SUPABASE_*` ausentes** en el job `e2e` del workflow → build de Vite sin credenciales, E2E falla de forma opaca.
4. **`find | xargs deno test` swallows "no tests found"** — exit 0 sin correr nada (`ci.yml:114-116`). Además falta `mkdir -p reports`.

### Vitest
5. **Flow tests son mocks puros**: `bookingFlow`, `invoiceFlow`, `paymentFlow` en `src/test/` llaman al mock directamente sin importar hooks reales → 0% cobertura efectiva.
6. **`paymentFlow.test.ts:66-72`** reimplementa la lógica de negocio dentro del test (`balance <= 0 → paid`).
7. **Sin umbral mínimo de cobertura** en `vitest.config.ts` + `fail_on_failure: false` en JUnit reporter → tests fallidos no rompen CI check.

### Playwright E2E
8. **`quote-pdf.spec.ts`** tiene 2× `test.skip(true)` que marcan en verde fallos reales (causa del flaky reciente).
9. **`invoice-payment.spec.ts:17-20`** mismo patrón `test.skip` condicional.
10. **`customer-create.spec.ts`** crea clientes en BD real sin teardown.

### Edge Functions
11. **0 tests para 7 funciones fiscales críticas**: `stamp-credit-note`, `stamp-payment-complement`, `cancel-credit-note`, `cancel-payment-complement`, `generate-recurring-invoices`, `parse-cfdi-expense`, `refresh-cancellation-status`.
12. **9 tests existentes son solo smoke** (CORS + 401): 0 happy paths, 0 RBAC real, 0 validación de body, 0 mocks de Facturapi.

---

## 🟠 Hallazgos Altos

**CI**
- `actions/checkout@v5` desactualizado → v6.
- Sin `tsc --noEmit` dedicado en `quality` (ESLint no captura todos los errores de tipos).
- Sin dependency audit (`bun audit`).
- `deno-version: v1.x` legacy → v2.x.
- `e2e` no depende de `quality` — desperdicia runners si build falla.

**Vitest**
- 165 hooks en `src/features/` con solo 8 tests (~5% cobertura de hooks).
- Sin RLS tests para `payments`, `contracts`, `quotes`, `audit_logs`, `parts`.
- 14 mocks inline de Supabase, solo 8 usan `createSupabaseChainMock`.
- `waitUntil` manual con timeout 15s en `rolePermissions.test.ts:79`.

**Playwright**
- `portal` project sin `dependencies: ["setup"]` → race condition.
- `expect.timeout: 5_000` global muy bajo (varios specs overridean a 15s).
- `page.waitForTimeout(500)` frágil en `global.setup.ts:55`.
- Sin cleanup periódico de filas `is_e2e=true` huérfanas por crashes.
- Smoke nav: `pageerror` listener demasiado estricto + sin assert de contenido renderizado.

**Edge Functions**
- Validación de body (400) ausente en `stamp-cfdi`, `cancel-cfdi`, etc.
- RBAC (403) nunca ejercitado — el check `user_roles` jamás se prueba.

---

## 🟡 Hallazgos Medios

**CI**: sin cache Bun / Playwright / Deno, `cancel-in-progress: true` también en push a main, sin merge de shards en reporte unificado, permisos heredados por todos los jobs.

**Vitest**: `InvoicesPage.test.tsx` usa `container.textContent` frágil, `setup.ts` no mockea `ResizeObserver` / `IntersectionObserver`, `mockSupabase.ts` redundante, `example.test.ts` placeholder sin valor.

**Playwright**: asserts débiles en `booking-to-invoice` (verifica `/bookings` genérico, no el ID), `invoice-payment` busca "pagado" en texto libre, `customer-create` con `.last()` heurístico.

**Edge Functions**: helper apunta a `VITE_SUPABASE_URL` (variable de cliente en contexto backend), `--allow-read` sin scope.

---

## 📋 Plan de Remediación por Lotes

### **Lote 1 — Hotfix de seguridad y CI silencioso** (1-2 h, P0)
Objetivo: eliminar credenciales del repo y bugs que ocultan fallos.

1. Eliminar `PUBLISHABLE_FALLBACK` y URL hardcodeada de `tests/e2e/fixtures/seed.ts`; fallar explícitamente si faltan secrets.
2. Eliminar URL de producción de `supabase/functions/_shared/test-helpers.ts`; fallback a `http://localhost:54321`.
3. Añadir secrets `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como `env:` del job `e2e` (Vite los necesita en build).
4. Reemplazar `find | xargs deno test` por `mapfile` + check de array vacío + `mkdir -p reports` + invocación por archivo (`xargs -I{}` o loop).
5. Cambiar `fail_on_failure: false` → `true` en ambos `mikepenz/action-junit-report` y `require_tests: false` → `true`.
6. Eliminar los 3 `test.skip(true)` en `quote-pdf.spec.ts` (×2) e `invoice-payment.spec.ts`. Reemplazar con `expect(...).toBeVisible()` + `Promise.all([waitForEvent, click])` sin `.catch(() => null)`.

### **Lote 2 — Cobertura efectiva** (1 sprint)
Objetivo: que los tests prueben código real, no mocks de sí mismos.

1. Reescribir `bookingFlow.test.ts`, `invoiceFlow.test.ts`, `paymentFlow.test.ts` importando los hooks reales (`useCreateBooking`, mutaciones de pagos) con `renderHook` + `createSupabaseChainMock`.
2. Migrar los 6 mocks inline restantes en `src/test/` a `createSupabaseChainMock`.
3. Añadir `coverage.thresholds: { lines: 60, functions: 60, branches: 50 }` en `vitest.config.ts` (subir progresivamente).
4. Crear RLS tests faltantes: `usePayments.rls.test.ts`, `useContracts.rls.test.ts`, `useQuotes.rls.test.ts`, `useAuditLogs.rls.test.ts`.
5. Tests Deno para las 4 funciones fiscales sin nada: `cancel-credit-note`, `cancel-payment-complement`, `stamp-credit-note`, `stamp-payment-complement` (mínimo CORS + 401 + 400 body inválido).
6. Tests de validación de body (400) y RBAC (403) para `stamp-cfdi` y `cancel-cfdi`.
7. Teardown en `customer-create.spec.ts` (RPC o DELETE directo via supabase client del fixture).
8. Cleanup workflow semanal que ejecute `e2e_teardown` global con scope `%`.

### **Lote 3 — Hardening de CI** (medio sprint)
1. Bump `actions/checkout@v5` → `@v6` (4 ocurrencias).
2. Bump `denoland/setup-deno` a `deno-version: v2.x`.
3. Añadir step `bun run tsc --noEmit` en job `quality`.
4. Añadir `bun audit` o `bunx better-npm-audit` en `quality` (xlsx tiene CVEs conocidas).
5. Añadir `needs: [quality]` al job `e2e`.
6. Activar cache: `setup-bun` con `cache: bun`, `actions/cache` para `~/.cache/ms-playwright` y `~/.cache/deno`.
7. Cambiar `cancel-in-progress` a condicional por evento (PR sí, push main no).
8. Mover `checks: write` y `pull-requests: write` al nivel de jobs específicos.
9. Job `report` con `playwright merge-reports` para HTML unificado entre shards.
10. Configurar branch protection (fuera del YAML) con required checks.

### **Lote 4 — Cobertura E2E de flujos faltantes** (2-3 sprints, ROI ordenado)
1. Auth negativa (credenciales inválidas → mensaje de error).
2. Portal cliente end-to-end real (login → ver factura → descargar PDF).
3. CRM deal won → cliente activo → cotización.
4. Damage workflow (reporte → bloqueo de disponibilidad → desbloqueo).
5. Mantenimiento kanban (crear → asignar → mover columna → cerrar).
6. Retornos (reserva activa → registrar devolución → equipo disponible).
7. Recurring billing (extender `e2e_seed_scenario` con `contracts` + trigger manual).
8. `parse-cfdi-expense` con fixtures XML anonimizados (función pura, no requiere DB).
9. Mock server de Facturapi (`Deno.serve` local) para happy paths de stamp/cancel.

### **Cambios paralelos a cada lote**
- Cada lote añade entrada en `public/changelog.json` + `public/changelog/v6.42.X.json` (siguiendo semver: lotes 1 y 3 = patch, lotes 2 y 4 = minor).

---

## 📦 Detalles técnicos por sección

### Estado actual del CI
```
permissions: contents:read, checks:write, pull-requests:write  ✅ mínimos
concurrency: cancel-in-progress: true                          ⚠️ también en push main
jobs: quality(15m), rls(10m), edge-functions(10m), e2e×2(20m)  ✅ paralelo
wall-clock: ~20-25 min  (sin cache → cada job reinstala node_modules ~30-60s)
sharding E2E: 2 shards × 2 workers = 4 paralelas               ✅ funciona
gates merge: fail_on_failure:false en JUnit → check no falla   ⚠️ confuso
```

### Estado actual de tests
```
Vitest: 77 archivos · 14 mocks Supabase · 9 RLS tests (todos mocks, 0 DB real)
        165 hooks de features → 8 con tests (~5%)
        sin coverage threshold · fail_on_failure:false

Playwright: 8 specs · seed/teardown con scope w{worker}-{id} ✅
            3 × test.skip(true) ocultan fallos
            customer-create sin teardown → contamina BD prod
            cobertura efectiva CRM/mantenimiento/retornos/contratos: ~0%

Deno: 9/22 funciones con tests (41%) · todos smoke (CORS + 401)
      7 funciones fiscales sin ningún test
      fallback hardcodeado a producción
```

### Aprobación
Si aprobás, ejecuto **Lote 1** (hotfix de seguridad y CI silencioso, ~1-2 h) y propongo separadamente los siguientes lotes para no mezclarlos.
