
## Diagnóstico

La auditoría visual con Playwright (9 rutas principales) capturó **dos bugs de runtime introducidos en los últimos cambios de dependencias**:

### Bug 1 — `RangeError: Incorrect locale information provided` (todas las páginas con un date picker)

Stack:
```
new Intl.Locale (…)
isRTL → getReadingDirection → getDefaultLocale
react-day-picker@10
```

Origen: `src/components/ui/calendar.tsx` pasa `locale={es}` importado desde `react-day-picker/locale`. En la combinación **react-day-picker v10 + date-fns v4**, el objeto `es` no expone un `code` BCP-47 utilizable por `new Intl.Locale(...)`, por lo que `getDefaultLocale()` revienta al montar el `Calendar`. Se introdujo en v7.53.0 (migración a RDP v10).

### Bug 2 — `Too many re-renders` en `RecurringInvoicesPreviewDialog` (rompe `/invoices` completo con ErrorBoundary)

Archivo: `src/features/invoices/components/recurring/RecurringInvoicesPreviewDialog.tsx`

El comentario del código dice “`lines` y `eligibleIds` conservan `useMemo`… sin identidad estable el efecto re-dispararía y provocaría un loop de setState”, pero el `useMemo` fue removido durante la limpieza del React Compiler (v7.48/v7.50). Hoy son expresiones locales:

```ts
const lines = data?.lines ?? [];
const eligibleIds = lines.filter(...).map(...);
...
if (prevEligibleRef.current !== eligibleIds) {   // siempre true
  prevEligibleRef.current = eligibleIds;
  setSelected(new Set(eligibleIds));             // loop
}
```

Cada render crea un array nuevo → la comparación por identidad siempre falla → `setSelected` en render → loop → React aborta.

## Cambios propuestos

**1. `src/components/ui/calendar.tsx`**
- Reemplazar `locale={es}` por la variante que sí funciona con RDP v10:
  - Opción A (mínima): importar `es` desde `date-fns/locale` y pasar `locale={{ ...es, code: "es-MX" }}` para garantizar el `code` BCP-47.
  - Opción B (más limpia): eliminar `locale` custom y usar `dir="ltr"` explícito + traducir labels vía `labels`/`formatters` props. Preferimos A por continuidad de i18n.
- Añadir un test mínimo en `src/components/ui/__tests__/calendar.test.tsx` que monte `<Calendar />` para prevenir regresión (hoy no existe smoke test).

**2. `src/features/invoices/components/recurring/RecurringInvoicesPreviewDialog.tsx`**
- Reintroducir la estabilidad de identidad que la lógica “adjust state during render” asume:
  - Derivar `eligibleKey` como `string` (por ejemplo `eligibleIds.join("|")`) y comparar por valor en el `if`, en lugar de identidad de array.
  - Mantener el patrón de React sin `useEffect`; sólo cambia el criterio de comparación.
- Alternativa considerada y descartada: reintroducir `useMemo`. El React Compiler ya memoiza, pero el criterio de identidad de arrays sigue siendo frágil; comparar por clave string es más robusto y no depende del compiler.

**3. Verificación**
- Re-correr `python3 /tmp/browser/audit/run.py` sobre las 9 rutas y confirmar `0 pageerror`.
- `bunx vitest run` sobre invoices y calendar.
- Screenshot final de `/invoices` con el diálogo `RecurringInvoicesPreviewDialog` abierto para confirmar render.

**4. Changelog**
- Nuevo entry `v7.55.1` (patch) documentando ambos fixes.

## Detalles técnicos

- No se toca la lista de dependencias — sólo consumo.
- No se altera lógica de negocio de facturación recurrente ni de selección de fechas; sólo la capa de presentación/estado local.
- Sin cambios en RLS, edge functions ni migraciones.

## Fuera de alcance

- Migrar a `@dnd-kit` (Lote F pendiente).
- Bump de `react-dropzone` v16 (Lote E pendiente).
- Otros warnings ya conocidos.
