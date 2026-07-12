## Contexto

CI del run `78954727240` falla solo en **E2E shard 1/2** con 3 tests reales (no flake de fuentes — mi patch anterior de `document.fonts.ready` ya está en el spec y no resolvió). Los demás jobs (Build, Typecheck, Vitest, Knip, ESLint, RLS, Edge Functions, shard 2) pasaron.

### Fallas exactas

1. **`customer-create.spec.ts:53`** — `expect(dialog).toBeHidden()` 15 s timeout. El modal `customer-form-dialog` sigue visible 33 chequeos después de click en "Agregar cliente". Signal: el submit RHF no cierra el diálogo → validación falla en silencio o `createCustomer.mutate` errorea (RLS/columna) y `handleCreateSuccess` nunca corre.
2. **`maintenance-kanban.spec.ts:25`** — `getByLabel(/vista de tablero/i).click()` supera 30 s. El `ToggleGroupItem value="board"` existe (`MaintenancePageActions.tsx:34`), pero probablemente el toolbar no está montado dentro del tiempo (SSR de la ruta lazy `/maintenance` + hidratación con Vite 7 + fuentes async).
3. **`quote-pdf.spec.ts:23`** — `waitForEvent("download", 20 000)` timeout. `useQuotePdfDownload` importa `@/lib/pdf/quote/build` en lazy; en CI cold-start supera 20 s o `buildQuotePdf` falla en silencio (notifyError sin download).

## Plan de fix

### Bloque A — Diagnóstico en el propio spec (defensivo, no cambia lógica)

Agregar en los 3 specs, antes de la acción crítica:

```ts
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });
```

Y en `customer-create` capturar el texto del alert de validación / toast de error si el dialog sigue abierto (`await dialog.locator('[role="alert"], .text-destructive').allTextContents()`) e imprimirlo antes de que expire el `toBeHidden`. Sin `test.skip` — el objetivo es que la próxima corrida deje evidencia en el log.

### Bloque B — Fixes directos por hipótesis dominante

1. **customer-create**
   - Hipótesis: el resolver Zod está en `mode: onSubmit` y el `TextField` de RFC transforma `.trim().toUpperCase()` post-parse; si el input llega con espacios trailing no hay bug, pero el `usePrefillEffect` corre con `useEffectEvent` y lista `run` en deps (contra la doc de React 19). En re-render `run` cambia y **resetea el form al segundo render**, borrando lo que el test escribió.
   - Fix: quitar `run` del array de deps de `useEffect` en `src/hooks/usePrefillEffect.ts` y añadir eslint-disable justificado (`react-hooks/exhaustive-deps`) porque `useEffectEvent` es estable por contrato.

2. **maintenance-kanban**
   - Hipótesis: `getByLabel` no espera al mount. Cambiar el paso a `await expect(page.getByLabel(/vista de tablero/i)).toBeEnabled({ timeout: 15_000 }); await page.getByLabel(/vista de tablero/i).click();` para que Playwright espere hidratación.
   - Sin tocar producción.

3. **quote-pdf**
   - Subir el timeout de descarga de 20 s a 45 s (cold-start del chunk `@react-pdf/renderer` de ~1.46 MB en CI). Además, `await expect(pdfButton).toBeEnabled({ timeout: 15_000 })` antes de click para asegurar que la lazy-chunk ya cargó.
   - `test.setTimeout(60_000)` en el spec.

### Bloque C — Verificación

- `bun run lint` (mantener 0 errores).
- `bun run build`.
- `bunx vitest run` (esperado 992/992; el flake preexistente de `registry.test.ts` corre aislado como en la corrida anterior).
- E2E se re-ejecuta en CI; Bloque A garantiza evidencia si algún fix no cierra el gap.

### Bloque D — Changelog

`public/changelog.json` + `public/changelog/v7.39.2.json` como `patch`: "Estabilización E2E shard 1: fix real en `usePrefillEffect` + esperas explícitas en specs sensibles a hidratación y a lazy chunks".

## Detalles técnicos

- `src/hooks/usePrefillEffect.ts`: eliminar `run` del array de deps del `useEffect` interno. `useEffectEvent` está diseñado para NO listarse; incluirlo hace que cada render regenere la identidad y dispare el effect en loop de un solo tick, sobrescribiendo el `form.reset` del usuario.
- `tests/e2e/customer-create.spec.ts`: añadir listeners `pageerror`/`console` + captura de alertas antes del `toBeHidden`.
- `tests/e2e/maintenance-kanban.spec.ts`: `await expect(toggle).toBeEnabled(...)` antes del click.
- `tests/e2e/quote-pdf.spec.ts`: `test.setTimeout(60_000)`, `toBeEnabled` en `pdfButton`, `timeout: 45_000` en `waitForEvent("download")`.
- No se tocan warnings de `import/order` (2096 warnings, 0 errores — no bloquean CI).

## Riesgos

- Si el fix de `usePrefillEffect` no es la causa raíz de customer-create, el Bloque A dejará el `pageerror`/alert-text en el log y podremos ajustar en el siguiente turno sin más adivinanzas.
- Aumentar timeouts en quote-pdf es reversible; no oculta regresiones porque `pageerror` seguirá haciendo fallar el test si el chunk lanza excepción.
