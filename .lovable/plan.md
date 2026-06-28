## Auditoría UI Kit @ 1080p — Modals, Dropdowns, Inputs, Buttons, Cards, Toasts

### Hallazgos en primitivas (`src/components/ui/*`)

**🔴 1. `Card` con hover global (alto impacto)**
`Card` define `hover:shadow-md transition-shadow` por defecto. Esto hace que **toda** Card del ERP "flote" al pasar el cursor, incluso las que son contenedores estáticos (KPIs del Dashboard, secciones del Estado de Resultados, wrappers de tablas). Solo las cards interactivas (KPI clicables de `FinancialKpiCards`, cards de drag-and-drop del CRM) deberían levantarse. Es la mayor fuente de "ruido visual" entre módulos.

**🔴 2. `DialogOverlay` y `SheetOverlay` con color hardcoded**
Ambos usan `bg-black/80`. Rompen el sistema de tokens y se ven idénticos en light/dark cuando deberían adaptarse. Reemplazar por `bg-background/80 backdrop-blur-sm` (patrón shadcn moderno).

**🟡 3. `CardTitle` con tipografía sobredimensionada**
Default = `text-2xl font-semibold`. La realidad: ~95% de las Cards lo sobrescriben a `text-base` o `text-sm`. Bajar el default a `text-base font-semibold tracking-tight` para que las pocas Cards sin override queden alineadas al resto del ERP (las tipografías grandes ya las gestiona `PageHeader`).

### Hallazgos en consumo

**🟡 4. Empty/Loading states con paddings inconsistentes**
`p-8`, `py-12`, `py-16` mezclados en `CashFlowPage`, `BankReconciliationPage`, `MrrDetailPage`, `BankStatementLinesTable`, `ManualStateCards`, `ActivityTimeline`. Estandarizar a `py-12` (escala Tailwind, match con shadcn `EmptyState`).

**🟢 5. Cosmético — doble línea en blanco**
`MrrDetailPage.tsx` líneas 104-105.

### Lo que ya está bien (no se toca)

- `Button` cva: 6 variantes coherentes (default/destructive/outline/secondary/ghost/link), focus-ring uniforme.
- `Input` / `Textarea` / `SelectTrigger`: misma altura `h-10`, mismo borde, mismo focus-ring.
- `Label` y `FormLabel`: `text-sm font-medium`, consistentes.
- `Toaster` (sonner): tokens semánticos, border-l por variante (success/warning/error), posición responsive (top-center móvil, bottom-right desktop).
- `DropdownMenu`: usa `bg-popover` con border y shadow uniforme.

### Cambios a aplicar

| Archivo | Cambio |
|---|---|
| `src/components/ui/card.tsx` | Quitar `hover:shadow-md transition-shadow duration-200` del default. Cambiar `CardTitle` default a `text-base font-semibold tracking-tight`. |
| `src/components/ui/dialog.tsx` | Overlay: `bg-black/80` → `bg-background/80 backdrop-blur-sm`. |
| `src/components/ui/sheet.tsx` | Overlay: `bg-black/80` → `bg-background/80 backdrop-blur-sm`. |
| `src/features/cash-flow/pages/CashFlowPage.tsx` | `py-16` → `py-12` (2 ocurrencias). |
| `src/features/dashboard/pages/MrrDetailPage.tsx` | `p-8` → `py-12` + eliminar línea en blanco duplicada. |
| `src/features/audit/components/activity/ActivityTimeline.tsx` | `p-8` → `py-12` en empty state. |
| `public/changelog.json` + `public/changelog/v6.99.0.json` | Entrada **minor** (cambios a primitivas del UI Kit). |

### Verificación posterior

Las Cards que **sí** deben mantener el hover (interactivas) ya lo declaran explícitamente en su `className`:
- `FinancialKpiCards` → `hover:shadow-lg hover:-translate-y-0.5`
- `StatCards` → `hover:shadow-lg hover:-translate-y-0.5`
- `ProspectCard` (CRM) → `hover:shadow-md`
- `MaintenanceKanbanCard` → shadow al draggear

Por lo tanto, retirar el hover del primitivo es seguro y elimina el efecto fantasma en todas las Cards estáticas.

### Resultado esperado
- Dashboard, Estado de Resultados, Cash Flow y reportes dejan de tener Cards que "respiran" al pasar el mouse — solo los KPIs clicables responden.
- Overlays de modales y sheets se integran al tema (más profesional en dark mode).
- Empty/loading states con la misma altura visual en todos los módulos.
- Cards sin `CardTitle` override dejan de mostrar un `text-2xl` desproporcionado.
