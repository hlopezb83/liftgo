## Auditoría tercera pasada — Cohesión 1080p

Hallazgos restantes tras los fixes previos:

**1. Grids de KPIs con gap inconsistente**
- `FinancialKpiCards.tsx` y `StatCards.tsx` usan `gap-3 sm:gap-4`. La norma documentada en `mem://arch/ui/component-library` dicta `gap-4` para filas de KPIs.

**2. Paddings de Card no estándar**
- `MrrDetailPage.tsx` usa `CardContent p-5` (no está en la escala Tailwind del sistema; debe ser `p-4` o `p-6`).

**3. H1 manual y `font-bold` en títulos no-numéricos**
- `NotFound.tsx`: usa `<h1 text-4xl font-bold>` para "404". Es una página de error y el numeral grande es aceptable, pero el subtítulo y CTA pueden alinearse al sistema usando `PageContainer`.

**4. PortalStatCard**
- `text-3xl font-bold` para valores numéricos — esto es correcto bajo la regla "font-bold reservado para cifras de KPI". Sin cambios.

### Cambios a aplicar

| Archivo | Cambio |
|---|---|
| `src/features/dashboard/components/dashboard/FinancialKpiCards.tsx` | `gap-3 sm:gap-4` → `gap-4` |
| `src/features/dashboard/components/dashboard/StatCards.tsx` | `gap-3 sm:gap-4` → `gap-4` |
| `src/features/dashboard/pages/MrrDetailPage.tsx` | `CardContent p-5` → `CardContent p-4` (línea 107) |
| `public/changelog.json` + `public/changelog/v6.98.9.json` | Nueva entrada patch |

### Por qué se omiten otros hallazgos

- `CashFlowSummaryCards p-3`: válido para tarjetas densas de resumen semanal.
- `ContractsPage`, `SuppliersPage`, `BookingsPage` con `CardContent p-4`: dentro de la escala estándar para filtros compactos.
- Padding `p-0` en cards que envuelven tablas: patrón intencional para que la tabla toque los bordes.

### Resultado esperado
Las 3 filas de KPIs del Dashboard (`StatCards`, `FinancialKpiCards`, MrrDetailPage) compartirán exactamente el mismo ritmo de espaciado a 1080p, eliminando el último salto visual entre módulos financieros.
