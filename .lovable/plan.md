## Lote 6 — Extraer `KpiTile`, `ReportChartCard` y `ListFilterBar`

Cerrar los tres componentes aparcados de Lote 5, siguiendo el mismo patrón DRY que `DetailRow`: un componente compartido en `src/components/domain/` + migración de los usos duplicados.

### Alcance

**1. `KpiTile`** (`src/components/domain/KpiTile.tsx`)
- Props: `label: string`, `value: ReactNode`, `icon?: ElementType`, `hint?: string`, `tone?: "default" | "success" | "warning" | "danger"`, `onClick?: () => void`, `href?: string`.
- Card compacta (`py-3 px-4`), label small-caps, value `text-2xl font-semibold tabular-nums`, icono opcional a la derecha, cursor-pointer si `onClick`/`href`.
- Migrar duplicados detectados en: `Dashboard`, `MRRDetailPage`, `ReportsHome`, `FleetROIReport`, `CashFlowReport` (~5-7 archivos).

**2. `ReportChartCard`** (`src/components/domain/ReportChartCard.tsx`)
- Wrapper `Card` + `CardHeader` (title + description + acciones opcionales) + `CardContent` con altura fija (`h-72` por defecto) y `ResponsiveContainer`.
- Props: `title`, `description?`, `actions?: ReactNode`, `height?: number`, `children`.
- Migrar en gráficas de `ReportsHome`, `FleetROIReport`, `MRRDetailPage`, `CashFlowReport`.

**3. `ListFilterBar`** (`src/components/domain/ListFilterBar.tsx`)
- Barra sticky con slot de `search` (input), `filters` (selects/chips) y `actions` (botones a la derecha).
- Reemplaza los headers repetidos en listados que usan `useListFilters`: `Bookings`, `Invoices`, `Quotes`, `Maintenance`, `Deliveries`, `Returns`, `Suppliers`, `Customers`, `Prospects`, `Parts`.
- No cambia lógica de filtrado (sigue en `useListFilters`); solo unifica layout y espaciados.

### Fuera de alcance
- No tocar lógica de datos, hooks de filtrado ni queries.
- No modificar contenido de tablas ni `MobileCardList`.
- No introducir cambios visuales; misma densidad y tokens actuales.

### Verificación
- `tsgo` limpio.
- Tests de features afectadas (`bunx vitest run`).
- `bunx knip --include files` sin nuevos archivos huérfanos.
- Revisión visual en Dashboard, `/mrr`, `/reportes`, un listado (Bookings) y una vista de detalle.

### Entregables
- 3 nuevos componentes en `src/components/domain/`.
- Migración de ~15-20 archivos consumidores.
- Entrada `v6.137.0` (minor: DRY, sin cambios funcionales) en `public/changelog.json` + `public/changelog/v6.137.0.json`.

### Orden de ejecución
1. `KpiTile` + migración + tests.
2. `ReportChartCard` + migración.
3. `ListFilterBar` + migración por listado (uno a uno para reducir riesgo).
4. Knip + typecheck + tests globales.
5. Changelog.
