## Migrar `cssPath.ts` a `@medv/finder`

### Cambios

**1. `src/features/feedback/lib/cssPath.ts`** — Reemplazar `computeCssPath` por wrapper de `finder()`:
- Mantener firma idéntica: `computeCssPath(el: Element): string`
- Mantener `describeElement` y `SelectedElementInfo` sin cambios (API pública intacta)
- Configurar `finder` para ignorar clases Tailwind con prefijos de estado (`hover:`, `focus:`, `active:`)
- Fallback a `el.tagName.toLowerCase()` si finder lanza

### Por qué

- Selectores **verificadamente únicos** (finder valida con `querySelectorAll`)
- Más cortos y estables: prioriza `id` → atributos → clases → `:nth-child`
- ~3 KB, batalla-probado (usado por Chrome DevTools recorder)
- Reduce `cssPath.ts` de 57 → ~30 LOC

### Sin cambios

- `ElementPicker.tsx`, `FeedbackFormFields.tsx`, `FeedbackDetailSheet.tsx`, `useCreateFeedback.ts`: siguen importando `describeElement` / `SelectedElementInfo` con la misma firma
- DB: `selected_element` JSONB sin migración (mismo shape)
- Reportes antiguos siguen funcionando (es solo display de string)

### Verificación

- `bunx vitest run` (esperado: 71/71 pasan)
- Smoke manual: abrir FAB → "Seleccionar elemento" → confirmar que el `cssPath` mostrado es válido y único

### Changelog

- `public/changelog.json` + `public/changelog/v6.7.6.json` (patch): "Mejora de robustez en selectores CSS del reporte de feedback usando `@medv/finder`."

### Nota

Ya instalé `@medv/finder@4.0.2` durante exploración. Al pasar a build mode aplico el cambio en `cssPath.ts` y el changelog.
