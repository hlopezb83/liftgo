
# Mejoras al Panel (Dashboard)

Cuatro ajustes puntuales, todos en UI (sin tocar lógica de negocio ni backend).

## 1. Eliminar card "Actividad Reciente"
- Quitar `<RecentActivity />` de `src/features/dashboard/pages/Dashboard.tsx`.
- Quitar el import correspondiente.
- Dejar el componente `RecentActivity.tsx` en su lugar (sigue usándose en otros módulos) — solo se desmonta del panel.

## 2. Eliminar card "Desglose de Facturas"
- En `src/features/dashboard/components/dashboard/DashboardChartsSection.tsx`, eliminar el render de `<InvoiceBreakdown />` y dejar `<FleetStatusChart />` ocupando ancho completo (cambiar el grid `lg:grid-cols-2` por una sola columna, o mover Fleet a layout único).
- Quitar las props `invoiceBreakdown` y `outstandingRevenue` de la interfaz y del padre `Dashboard.tsx` / `useDashboardSections` (solo a nivel de paso de props; el cálculo subyacente se mantiene por ahora para no romper otros consumidores; si no se usa en ningún otro lado, también se limpia).

## 3. Flujo de Efectivo: mostrar Neto en el tooltip
- En `CashFlowChart.tsx`, reemplazar el `<Tooltip>` por uno con `content` personalizado (estilo shadcn) que renderice:
  - Facturado: $X
  - Pagado: $Y
  - **Neto: $(Y − X)** con color verde si ≥ 0, rojo si < 0, y etiqueta "Flujo positivo"/"Flujo negativo".
- Mantiene el mismo `formatCurrency` y tokens semánticos (`text-status-available` / `text-destructive`).

## 4. Utilización de Flota: línea de tendencia
- En `UtilizationCharts.tsx`, cambiar `<BarChart>` por `<ComposedChart>` de recharts con:
  - `<Bar dataKey="utilization" />` (igual que hoy).
  - `<Line dataKey="trend" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />` superpuesta.
- Calcular `trend` con regresión lineal simple (mínimos cuadrados) sobre los puntos de `weeklyUtilization` dentro del propio componente (useMemo). Agrega un sub-texto debajo del título: "Tendencia: ↑ subiendo X%" / "↓ bajando X%" / "→ estable", comparando el primer y último valor de la línea de tendencia.

## Changelog
- Agregar entrada `v6.20.0` (minor — mejoras de UX del panel) en `public/changelog.json` y `public/changelog/v6.20.0.json` con título "Panel: limpieza y métricas enriquecidas" y descripción de los 4 cambios.

## Archivos a modificar
- `src/features/dashboard/pages/Dashboard.tsx`
- `src/features/dashboard/components/dashboard/DashboardChartsSection.tsx`
- `src/features/dashboard/components/dashboard/CashFlowChart.tsx`
- `src/features/dashboard/components/dashboard/UtilizationCharts.tsx`
- `src/features/dashboard/hooks/dashboard/useDashboardSections.ts` (limpiar props no usadas si aplica)
- `public/changelog.json` + `public/changelog/v6.20.0.json`
