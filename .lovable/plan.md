## Lote 7 — Cierre de auditoría: limpieza fina

Tras 6 lotes, no quedan god components ni archivos >300 LOC en código de aplicación (los únicos >300 son `types.ts` autogenerado, `sidebar.tsx` y `chart.tsx` de shadcn). El scan de seguridad ya se ejecutó en Lote 5-6. Quedan sólo hallazgos cosméticos de `knip` y un par de oportunidades de higiene.

### Cambios propuestos

1. **Eliminar export no usado** `PaymentMethodValue` en `src/features/invoices/lib/paymentMethods.ts:12` (knip lo marca como dead export, introducido en Lote 5). Lo dejamos como tipo local sin `export`.

2. **Limpiar `knip.json`** según las 3 sugerencias del scanner:
   - Quitar `@playwright/test` de `ignoreDependencies` (ya no necesario).
   - Quitar el entry pattern redundante `src/main.tsx`.
   - Quitar el entry pattern redundante `playwright.config.ts`.

3. **Cerrar la auditoría con un resumen ejecutivo** en `.lovable/plan.md` (sobrescribir con el balance final de los 7 lotes: archivos nuevos, tests añadidos, bugs corregidos, hallazgos de seguridad revisados).

4. **Changelog** `v6.66.0` (patch): "Cierre de auditoría: limpieza de exports muertos y configuración de knip".

### Fuera de alcance

- Refactor adicional: ya no hay candidatos con ROI positivo. Los archivos 200-251 LOC son cohesivos y dividirlos sería abstracción especulativa.
- `sidebar.tsx` (637 LOC) y `chart.tsx` (303 LOC) son de shadcn/ui — no se modifican por convención.
- Findings `WARN` del scan de Supabase ya documentados en Lote 5 como intencionales (`SECURITY DEFINER` con `has_role()`).

### Verificación

- `bunx tsc --noEmit -p tsconfig.app.json` limpio.
- `bunx vitest run` sigue 581/581 verde.
- `bunx knip` 0 hallazgos.

### Entregables

- `src/features/invoices/lib/paymentMethods.ts` (quitar export del tipo).
- `knip.json` ajustado.
- `.lovable/plan.md` reemplazado por resumen final de la auditoría.
- `public/changelog.json` + `public/changelog/v6.66.0.json`.

¿Procedo con Lote 7 y cierro la auditoría?
