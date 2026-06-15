# Cambiar Utilización de Flota: semanal → mensual

Reemplazar la serie de 8 semanas por **6 meses** (incluyendo el mes en curso), manteniendo la misma fórmula de días-flota ocupados / días-flota disponibles.

## Cambios

### 1. RPC `get_dashboard_stats` (migración)
Reemplazar el bloque `weekly_utilization` por uno equivalente mensual:

- Generar 6 meses con `generate_series` truncando a `month`.
- Para cada mes calcular `[month_start, month_end]` (último día real del mes).
- Utilización = `SUM(días traslapados de bookings confirmed) / (flota_activa × días_del_mes) × 100`, redondeado.
- Excluir forklifts con status `retired` / `sold`.
- Label: `TO_CHAR(month_start, 'Mon YY')` en español vía `TO_CHAR(... , 'TMMon YY')` con `lc_time` o, más simple, mapear los 12 nombres en SQL para garantizar es-MX (Ene, Feb, Mar, …). Voto por el mapeo explícito para no depender de locale del servidor.

La clave del JSON se renombra a `monthly_utilization` (más honesta que reutilizar `weekly_utilization`).

### 2. Frontend
- `useDashboardStats.ts`: renombrar campo `weekly_utilization` → `monthly_utilization` y el item interno `week_label` → `month_label`.
- `dashboardSectionHelpers.ts`: `mapWeeklyUtilization` → `mapMonthlyUtilization`, devuelve `{ month_label, utilization }`.
- `UtilizationCharts.tsx`:
  - Prop `weeklyUtilization` → `monthlyUtilization`.
  - `dataKey="week_label"` → `dataKey="month_label"`.
  - Texto del título: **"Utilización de Flota — Últimos 6 meses (%)"**.
  - Texto de tendencia se mantiene (sigue siendo regresión lineal sobre los puntos).
- `DashboardChartsSection.tsx` y `useDashboardSections.ts`: propagar el rename de la prop.
- Test `dashboardSectionHelpers.test.ts`: actualizar al nuevo shape.

### 3. Changelog
Entrada `v6.71.3` (patch) en `public/changelog.json` + `public/changelog/v6.71.3.json`:
- Título: "Dashboard: utilización de flota ahora mensual (6 meses)".
- Razón: ventana semanal era muy corta para leer tendencias reales de rentas largas.

## Out of scope
- No se cambia el cálculo de utilización por unidad (sigue siendo ventana 30 días).
- No se toca el KPI de MRR ni `/mrr`.
