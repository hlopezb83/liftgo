## Auditoría Ola 1 + Plan Ola 2

### Auditoría Ola 1 (v7.114.2)

- `bunx eslint . -f json` → **0 errors, 82 warnings** (venían 89 tras autofix; restamos los 7 quick wins → 82 ✓).
- Todos los `eslint-disable-next-line` agregados apuntan a la regla exacta y llevan comentario `--` con justificación (skips condicionales E2E, polling de token, autoFocus en modal). Sin efectos colaterales visibles.
- El autofix de `import-x/order` sólo reordena imports; sin cambios de lógica.
- **Tests faltantes:** ninguno. Los cambios son mecánicos (orden de imports) o comentarios de lint sobre líneas ya cubiertas por sus suites correspondientes.
- **Bugs:** no detectados. CI runners de typecheck/tests/build ya se disparan automáticamente por push previo.

**Verde. Continúo a Ola 2.**

---

### Ola 2 — `react-hooks/set-state-in-effect` (v7.114.3)

24 warnings en 24 archivos. Al inspeccionarlos se agrupan en 4 patrones bien definidos, cada uno con su remediación canónica de React 19 / React Compiler:

| Patrón | # aprox | Ejemplos | Remediación |
|---|---|---|---|
| **A. Estado derivado puro** | 4 | `useRecordPaymentForm:44` (SAT code desde `method`), `useProspectForm`, `useContractFormState` | Reemplazar `useState + useEffect` por `useMemo` o cálculo inline. Cero riesgo. |
| **B. Reset local al abrir modal** | 12 | `DatePickerField`, `DateRangePickerField`, `RegisterSupplierPaymentDialog`, `SupplierBillFormDialog`, `PostBookingDeliveryDialog`, `PostBookingPolicyDialog`, `PostDeliveryPickupDialog`, `EditNameDialog`, `useSetPasswordForm`, `useRecordPaymentForm:37`, `useExportPaymentsForm`, `usePaymentSelection` | Sustituir efecto por `key={open ? id : "closed"}` en el Dialog child (React remonta y resetea sin efecto). Cuando el consumidor no controla el key, mantener el efecto y suprimir la regla con justificación (el propio React docs valida el patrón "reset when a prop changes"). |
| **C. Default derivado de datos async** | 3 | `BankReconciliationPage` (primera cuenta activa), `CashFlowSettingsBar`, `ContractTemplateTab` | Reemplazar por `useMemo` que devuelve `stateOverride ?? computedDefault`, moviendo la elección efectiva al render. Los handlers de "cambio manual" siguen usando `setState` normal. |
| **D. One-shot side-effect al montar** | 5 | `useChangelogDeepLink`, `CustomersPage` (prefill de query param), `SearchBar`, `ListPageLayout`, `ImageGalleryLightbox`, `useFeedbackStatusUpdate` | Envolver el `setState` en `useEffectEvent` (React 19) o extraer a un handler; cuando sea un one-shot legítimo con dependencias inevitables, suprimir con justificación puntual. |

### Ejecución por sub-ola

**2.a — Patrón A (derivado puro)** — 4 archivos, sin riesgo funcional. Test: los suites Vitest existentes deben pasar sin tocar.

**2.b — Patrón B (reset por `open`)** — 12 archivos. Para dialogs propios donde controlamos el árbol, usar `key` prop en el `<DialogContent>` interno para forzar remount al abrir; esto elimina el efecto sin cambiar UX. Para hooks (`usePaymentSelection`, `useExportPaymentsForm`, `useSetPasswordForm`) que dependen de props del consumidor, mantener el efecto con `eslint-disable-next-line react-hooks/set-state-in-effect -- Reset de estado local al abrir el modal (patrón oficial React docs)`.

**2.c — Patrón C (defaults)** — 3 archivos. Refactor a `useMemo`.

**2.d — Patrón D (one-shot)** — 5 archivos. Preferir `useEffectEvent` (ya usado en el proyecto para casos similares); si no aplica, disable justificado.

### Validación por sub-ola

Después de cada sub-ola:
- `bun run lint` → contador debe bajar por N warnings, 0 errors.
- `bunx vitest run` → 1083/1083 verde.
- Smoke visual con Playwright de los dialogs tocados (patrón B) para confirmar que "abrir → resetear" sigue funcionando: `DatePickerField`, `SupplierBillFormDialog`, `RegisterSupplierPaymentDialog`.

### Tests adicionales

- Patrón B con `key` remount: añadir 1 test por dialog tocado en Vitest usando `@testing-library/react` — abrir dialog, escribir en campo, cerrar, reabrir, asegurar que el campo está vacío.
- Patrón A: si un hook migrado no tiene test previo, añadir uno mínimo que verifique la derivación (ej. `useRecordPaymentForm` con distintos `method` → SAT code esperado).

### Resultado esperado

82 → ~58 warnings tras Ola 2. Rutas siguientes:
- Ola 3.a: `react-hooks/refs` (27)
- Ola 3.b: `react-refresh/only-export-components` (9) + `incompatible-library` (6) + `react-compiler` (2)
- Ola 3.c: `max-lines-per-function` (6) + `complexity` (3) + resto (3)

¿Arranco 2.a (derivado puro, riesgo cero) para tener validación temprana antes de meter mano a los 12 dialogs?
