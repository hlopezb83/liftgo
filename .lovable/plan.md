
# Fix de lint warnings (9 → 0)

Objetivo: eliminar los 9 warnings sin cambiar comportamiento. Combinación de refactor real donde aporta y `eslint-disable-next-line` con justificación cuando el patrón es intencional.

## Cambios

### 1. `react-hooks/set-state-in-effect` (5 casos)

- **`src/features/system/components/GlobalSearch.tsx`** — eliminar el effect que resetea `input`; mover el reset a un wrapper `handleOpenChange` que se pasa como `onOpenChange`. Sin effect = sin warning.
- **`src/components/layout/listPage/useListPagePullToRefresh.ts`** — intencional (necesita DOM ref post-mount para sincronizar el target de `usePullToRefresh`); añadir `// eslint-disable-next-line react-hooks/set-state-in-effect` con razón inline.
- **`src/features/contracts/hooks/contractForm/useContractFormState.ts`** — intencional (hidratación one-shot RHF desde prop async); disable con razón.
- **`src/features/quotes/hooks/quoteForm/useQuotePrefill.ts`** — mismo patrón hidratación; disable con razón.

### 2. `max-lines-per-function` — `CalendarPage.tsx` (159 → <150)

Extraer dos componentes pequeños en el mismo archivo:
- `EndingSoonAlert({ items, forkliftMap })`
- `CalendarToolbar({ viewMode, setViewMode, ganttRange, setGanttRange, onRefresh, isRefreshing })`

Baja el tamaño de la función principal manteniendo la vista idéntica.

### 3. `complexity` — `PortalInvoicePayment.tsx` (18 → <15)

Extraer:
- `<PortalIntentsTable intents={intents} />` (tabla histórica)
- `<ForeignCurrencyNotice moneda balanceLabel />` (card USD)
- Helper `statusLabel` a módulo local fuera del componente.

Reduce ramas del render principal por debajo del umbral.

### 4. Warnings de Playwright e2e (3 casos, intencionales)

Añadir `// eslint-disable-next-line <rule> -- <razón>` sobre cada línea:
- `tests/e2e/portal-statement.spec.ts:15` (`playwright/no-skipped-test`) — skip runtime cuando faltan credenciales.
- `tests/e2e/return-inspection.spec.ts:30` (`playwright/no-conditional-expect`) — assert opcional cuando el botón existe (seed puede no tener reserva devolvible).
- `tests/e2e/roles-matrix.spec.ts:93` (`playwright/no-skipped-test`) — centinela cuando ningún rol tiene credenciales.

## Verificación

`bunx eslint .` → 0 warnings; `bunx tsgo --noEmit` limpio; smoke a `/calendar` y `/portal/invoices/:id/pay` sin cambios visuales.

## Changelog

`v7.228.1` (patch): lint hygiene — 9 warnings resueltos sin cambio funcional. Entradas en `public/changelog.json` + `public/changelog/v7.228.1.json`.
