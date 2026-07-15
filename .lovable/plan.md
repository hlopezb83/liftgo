## Auditoría — Suite Playwright E2E (18 specs, 3 fixtures, ~1,200 LOC)

### Fortalezas actuales (para preservar)

- **Aislamiento por scope**: `e2e_seed_scenario(p_scope)` + `is_e2e=true` + teardown por RPC → paralelismo real sin colisiones.
- **Env vars sin fallback**: `throw` inmediato si faltan `VITE_SUPABASE_*` — evita builds silenciosos con credenciales vacías.
- **Global teardown race-safe** con sharding (`SHARD_INDEX === SHARD_TOTAL`).
- **Portal en proyecto separado** (sin storageState de admin).
- **Historial documentado** en comentarios (v6.47.1, v7.62.2, v7.71.2, v7.72.1) → futuros bugs no se re-introducen.

### Hallazgos priorizados

| # | Severidad | Ubicación | Problema | Impacto |
|---|-----------|-----------|----------|---------|
| 1 | **CRÍTICO** | `seed.ts:34`, `helpers.ts:11`, `customer-create.spec.ts:72`, `portalSeed.ts` | El "extract Supabase access token from localStorage" está copiado en 4 lugares con 3 firmas distintas. | Fix a un solo lugar no se propaga; futuros specs copian la peor versión. |
| 2 | **ALTO** | `customer-create.spec.ts:64`, `filters-invoices.spec.ts:32/43`, `visual-*.spec.ts` | 6 usos de `waitForLoadState("networkidle").catch(() => {})` que se tragan timeouts reales. | Fuente #1 de flakiness — un fetch atascado pasa como éxito y la assert siguiente falla con mensaje inútil. |
| 3 | **ALTO** | `filters-quotes.spec.ts:35` y `:38/40` | `test.skip(true, "sin campo de búsqueda")` cuando falta el searchbox, y `waitForTimeout(400)` como debounce. | Skip silencioso oculta regresión real del buscador. Delays fijos son flaky en runners fríos. |
| 4 | **ALTO** | `global.setup.ts:57` (`waitForTimeout(500)`) | Espera arbitraria para que Supabase persista el token en localStorage. | Race condition: en runners lentos el storageState queda sin token y toda la suite falla en cascada. |
| 5 | **MEDIO** | `roles-matrix.spec.ts:64` | Se salta cada rol si faltan sus 6 env vars (`E2E_VENTAS_*`, `E2E_ADMINISTRATIVO_*`, `E2E_MECANICO_*`) — nunca están en CI. | El spec **nunca corre en CI** hoy. El gate de secrets en `ci.yml` no los valida → auditoría de permisos = 0 cobertura. |
| 6 | **MEDIO** | `quote-pdf.spec.ts:39`, `daterange-picker.spec.ts`, `filters-*.spec.ts` | Selectores acoplados a copy en español (`/periodo\|rango\|fecha/i`, `/sin pagar/i`). | Cada renombre de UI rompe el spec; ya nos pasó 3 veces (`"pendiente"` → `"Sin Pagar"`, aria-labels de rdp v10, etc.). |
| 7 | **MEDIO** | `playwright.config.ts:60` (`trace: "on-first-retry"`) | Si un test falla en la primera corrida sin retry, se pierde el trace. | Debugging de fallos únicos requiere reproducir localmente — pérdida de tiempo. |
| 8 | **BAJO** | Sin `eslint-plugin-playwright` en `package.json:89`. | Reglas como `no-conditional-in-test`, `no-wait-for-timeout`, `expect-expect` no aplican. | Los antipatrones anteriores (2, 3) se re-introducen sin aviso. |

Extras menores: timeouts mágicos (`5_000`/`10_000`/`15_000`/`20_000`/`45_000`) scattered; `document.fonts?.ready` copiado en 3 specs; `filters-quotes` usa `aria-selected` mientras `filters-invoices` usa `data-state`; `page.on("pageerror")` loguea pero no falla en 5 specs.

---

## Plan de mejora — 3 sprints incrementales

### Sprint K.1 — Hardening (0 riesgo, alto impacto en flakiness)

**Objetivo**: eliminar todas las fuentes silenciosas de flakiness antes de tocar API surface.

1. **Extraer `waitForAuthToken`** en `fixtures/helpers.ts` — reemplaza `waitForTimeout(500)` en `global.setup.ts` por polling con timeout duro (30s). Elimina la copia inline en `customer-create.spec.ts:72-85`.
2. **Reemplazar los 6 `waitForLoadState("networkidle").catch()`** por esperas dirigidas:
   - Filters: `page.waitForResponse(/rest\/v1\/invoices/, ...)` tras cada click de tab.
   - Visual: `expect(page.getByTestId("data-table-body")).toBeVisible()` en lugar de networkidle.
3. **Añadir `eslint-plugin-playwright`** (`bun add -D eslint-plugin-playwright`) con `"plugin:playwright/recommended"` en `eslint.config.js`, scope `tests/e2e/**`. Auto-detecta: `no-wait-for-timeout`, `no-conditional-in-test`, `expect-expect`, `no-skipped-test` (warn), `no-focused-test` (error), `valid-expect`.
4. **Cambiar `trace: "on-first-retry"` → `trace: "retain-on-failure"`** y `video: "retain-on-failure"` (ya está) — captura el trace de la primera falla, aunque no retry.

Entregable: 0 warnings de `eslint-plugin-playwright`, primera corrida CI post-merge con 0 flakes.

### Sprint K.2 — Robustez de selectores (bajo riesgo, blinda contra rebranding)

**Objetivo**: desacoplar tests del copy en español y estabilizar selectores críticos.

5. **Añadir `data-testid` estables** a los 8 elementos que hoy se localizan por regex de copy:
   - `DateRangePickerField` trigger → `data-testid="date-range-trigger"`.
   - `StatusTabs` de facturas/cotizaciones → `data-testid={value}` en cada `<TabsTrigger>`.
   - Botón "Registrar Pago" (ya tiene `data-testid="record-payment-*"` — expandir a otros).
   - Botón "Descargar PDF" en cotizaciones → `data-testid="quote-download-pdf"`.
   Actualizar los 7 specs afectados para usar `getByTestId`.
6. **Reemplazar `test.skip(true, "sin campo de búsqueda")`** en `filters-quotes.spec.ts` por `expect(search).toBeVisible()`. Si el searchbox desapareció, es una regresión, no un skip.
7. **Añadir `assertNoPageErrors(page)` helper** en `fixtures/helpers.ts` — registra `pageerror` + `console.error` en un array y expone assert. Usar en los 5 specs que hoy solo loguean (`customer-create`, `quote-pdf`, `maintenance-kanban`).

Entregable: 0 specs con selectores basados en regex de copy en flujos críticos.

### Sprint K.3 — Cobertura y observabilidad (mediano riesgo, alto valor)

8. **Activar `roles-matrix.spec.ts` en CI**:
   - Añadir `E2E_VENTAS_EMAIL/PASSWORD`, `E2E_ADMINISTRATIVO_*`, `E2E_MECANICO_*` al gate de secrets en `ci.yml` (warning si faltan, no bloqueo).
   - Documentar en `tests/e2e/README.md` cómo crear los 3 usuarios de test con `has_role(...)` correspondiente.
   - Si no se quieren crear los 3 usuarios: bajar el spec a un solo rol admin + assertions sobre `role_permissions` vía RPC — más rápido y sin infra de auth.
9. **Reforzar `quote-pdf.spec.ts`**: además del filename, leer los primeros bytes del `Download` y verificar header `%PDF-` — evita false positive si el chunk lazy falla y descarga HTML de error.
10. **Constante de timeouts** en `fixtures/helpers.ts`:
    ```ts
    export const TIMEOUTS = { short: 5_000, medium: 10_000, long: 15_000, xl: 30_000, pdf: 45_000 };
    ```
    Reemplazar los ~40 números mágicos.

Entregable: cobertura de permisos activada en CI, PDF spec robusto, timeouts consistentes.

### Sprint K.4 (opcional, mayor esfuerzo)

- **Baselines visuales dentro de CI**: workflow `visual-baselines.yml` con `workflow_dispatch` que regenera y abre PR con los PNGs. Único camino correcto para activar la suite visual (ya discutido en el turno anterior).
- **Playwright merge-reports**: fusionar los HTML reports de los 4 shards en uno solo descargable del PR.
- **Test tags** (`@smoke`, `@critical`, `@visual`) para poder correr subsets en pipelines distintos (pre-commit vs release).

---

## Detalles técnicos

**Archivos a tocar en cada sprint:**

- K.1: `tests/e2e/global.setup.ts`, `tests/e2e/fixtures/helpers.ts`, `tests/e2e/fixtures/seed.ts`, `tests/e2e/customer-create.spec.ts`, `tests/e2e/filters-invoices.spec.ts`, `tests/e2e/filters-quotes.spec.ts`, `tests/e2e/visual-*.spec.ts`, `playwright.config.ts`, `eslint.config.js`, `package.json`.
- K.2: `src/components/forms/DateRangePickerField.tsx`, `src/components/ui/status-tabs/*`, `src/features/quotes/**/QuoteDownloadButton.tsx` (agregar `data-testid`); 7 specs actualizados; `tests/e2e/fixtures/helpers.ts`.
- K.3: `.github/workflows/ci.yml` (gate de secrets), `tests/e2e/README.md`, `tests/e2e/quote-pdf.spec.ts`, `tests/e2e/roles-matrix.spec.ts`, `tests/e2e/fixtures/helpers.ts` (constantes).

**Riesgos y mitigación:**

- K.1 introduce `eslint-plugin-playwright` → puede levantar warnings latentes en specs ya committeados. Mitigación: correr `bunx eslint --fix` primero y clasificar residuos como `warn` no `error` en el ruleset inicial.
- K.2 requiere tocar componentes de producción para añadir `data-testid`. Riesgo: cero (es solo un atributo). Beneficio: permanent.
- K.3.8 requiere crear 3 usuarios en Supabase auth. Si no hay presupuesto → fallback a la variante RPC-based (más aislada, más rápida).

**Cambios de infraestructura, no de lógica:**

- Ningún cambio requiere migraciones SQL, edge functions ni RLS.
- Ninguna dependencia nueva salvo `eslint-plugin-playwright` (~30 kB, sin runtime cost).

### Recomendación

Empezar con **Sprint K.1** — es donde vive el 80 % de los flakes que hemos debuggeado (v7.61.10, v7.62.2, v7.72.1). Después evaluamos K.2 y K.3 según prioridad.
