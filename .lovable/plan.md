## Diagnóstico

**1) Knip:** ejecuté `bunx knip` en el repo actual y pasa (exit 0). El error del anexo viene de una corrida anterior al arreglo v7.247.1 (borrado de `PortalStatCard.tsx`). No hay nada nuevo que corregir; sólo re-verificar.

**2) E2E flaky** (`bank-reconciliation.spec.ts`, `openReconciliation`): el click al `combobox` agotó los 30 s del test (pasó en el reintento). Hay dos causas reales que confirmé en `src/features/bank-reconciliation/pages/BankReconciliationPage.tsx`:

- Mientras `useBankAccounts()` está cargando, `accounts` es `undefined` y la condición `(accounts ?? []).length === 0` renderiza el **estado vacío** ("Crear primera cuenta") en vez de un skeleton. En CI frío el selector puede tardar en aparecer y, si el usuario/test llega antes, ve un vacío falso.
- El test usa `getByRole("combobox").first()` sin `timeout` explícito: hereda el timeout global del test (30 s) que ya venía consumido por login + `goto` + render.

## Cambios propuestos

### Frontend (bug real de UX)
`BankReconciliationPage.tsx`:
- Tomar `isLoading` de `useBankAccounts()` y mostrar un skeleton mientras carga; el estado vacío sólo cuando la carga terminó y hay 0 cuentas.
- Agregar `data-testid="bank-account-select"` al `SelectTrigger` para un selector estable.

### Test E2E
`tests/e2e/bank-reconciliation.spec.ts`:
- Usar `getByTestId("bank-account-select")` en lugar de `getByRole("combobox").first()`.
- Esperar explícitamente su visibilidad con `TIMEOUTS.long` antes del click.
- Subir el timeout de este archivo con `test.describe.configure({ timeout: 60_000 })` (los tests siembran datos vía API y navegan; 30 s es justo en CI).

### Cierre
- Correr `tsgo --noEmit`, `bun run lint`, `bunx knip` y el spec de conciliación.
- Agregar entrada de changelog (patch, v7.247.3) en `public/changelog.json` + `public/changelog/v7.247.3.json`.

## Detalle técnico
El estado vacío falso ocurre porque React Query devuelve `undefined` en el primer render; el `?? []` colapsa "cargando" y "sin datos" en el mismo caso. Se separa con `isLoading`.
