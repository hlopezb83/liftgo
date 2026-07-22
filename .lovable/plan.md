# Auditoría UI/UX — Panel (Dashboard)

Análisis realizado en 1600×900 (estándar), 1280×900 y 390×844 (móvil), con la sesión real del ERP.

## Estado actual

Estructura vertical: `PageHeader` → **Operación** (5 KPI cards) → **Finanzas** (4 KPI cards) → **Alertas** (Facturas Vencidas, Rentas Vencidas, Pronóstico de Cobranza, Seguros) → **Gráficas** (Estado de la Flota, Utilización, Flujo de Efectivo). Total scroll ≈2240 px en 1600×900.

## Hallazgos (H1–H12)

### Lote A — Jerarquía y densidad (P1, alto impacto visual)

**H1. Aprovechamiento horizontal deficiente en Finanzas.**
Los 4 KPI financieros ocupan 4 columnas mientras Operación usa 5. Rompe la retícula visual y desperdicia densidad. Fijar `grid-cols-5` o unificar ambas filas a 5 celdas (dejando una libre o moviendo un KPI operativo).

**H2. "Facturas Vencidas" domina la pantalla inicial.**
En 1600×900 ocupa ~450 px y empuja Rentas Vencidas y Pronóstico bajo el fold. Colapsar a 3 filas + "Ver 7 más", o convertirla en tabla compacta zebra al estilo del resto del ERP.

**H3. Bloques de gráficas apilados a ancho completo.**
`Estado de la Flota`, `Utilización` y `Flujo de Efectivo` se renderizan uno debajo de otro con >600 px cada uno. En 1600×900 debe ser `grid-cols-2` (o `12-col` con Estado de Flota ocupando 4, Utilización 8) para reducir scroll ~50%.

**H4. Dona "Estado de la Flota" descentrada y sin totales.**
La leyenda queda debajo, el centro del donut está vacío. Añadir total al centro (52 equipos) y mover leyenda al lado derecho.

### Lote B — Contenido y microtipografía (P2)

**H5. KPI cards sin contexto de tendencia.**
Ninguno de los 9 KPIs muestra delta vs periodo anterior ni sparkline. Añadir `Δ vs mes anterior` con flecha/color (patrón ya usado en MRR/Métricas).

**H6. "Utilización de Flota — Últimos 6 meses (%)" con estado vacío mudo.**
"Sin datos aún" sin CTA ni explicación. Reemplazar con `EmptyState` (icono, título, hint: "Se poblará al confirmar reservas") — patrón ya estandarizado en el ERP.

**H7. "Flujo de Efectivo" con leyenda huérfana.**
Muestra "Sin datos de facturación aún" y debajo la leyenda `Facturado / Pagado` sin gráfica. Ocultar leyenda cuando no hay datos.

**H8. Pronóstico de Cobranza — jerarquía plana.**
Los tres montos (Vencido hoy / 7 días / 30 días) tienen mismo peso tipográfico. El monto vencido debe ser el más prominente y los otros dos secundarios; el subtítulo "10 facturas" debería ser link a la lista filtrada.

**H9. Aging buckets como chips desconectados.**
`0-30d / 31-60d / 61-90d` se muestran como badges neutros. Convertir en mini-barra apilada horizontal (ya se usa el patrón en Reportes) con click a filtro correspondiente.

### Lote C — Accesibilidad, móvil y consistencia (P3)

**H10. Header móvil sin título "Panel".**
En 390×844 el `TopbarBreadcrumbs` solo muestra "Panel" en el breadcrumb, pero el H1 "Panel / Vista general de la flota" queda inmediatamente debajo duplicando. Ocultar el subtítulo en `<sm` o el H1 cuando ya está en la breadcrumb.

**H11. Cards de alerta sin `role="region"` ni `aria-label`.**
`Facturas Vencidas (10)`, `Rentas Vencidas (3)`, `Seguros (52)` son secciones críticas sin landmark. Agregar `role="region"` + `aria-labelledby`.

**H12. Colores hardcoded en dona (verde/azul/gris).**
`FleetStatusChart` usa hex literales para Disponibles/Rentados/Vendidos. Migrar a tokens semánticos (`--chart-success`, `--chart-info`, `--chart-neutral`) para respetar modo oscuro y la memoria de design system.

## Detalle técnico

Archivos afectados por hallazgo:

| # | Archivo |
|---|---|
| H1 | `FinancialKpiCards.tsx` (grid → 5 col o normalizar con `StatCards`) |
| H2 | `DashboardAlertsSection.tsx` / lista de `overdueInvoices` |
| H3, H4 | `DashboardChartsSection.tsx`, `FleetStatusChart.tsx` |
| H5 | `StatCards.tsx`, `FinancialKpiCards.tsx` + `useFinancialKpis.ts` (agregar delta MoM) |
| H6, H7 | `UtilizationCharts.tsx`, `CashFlowChart.tsx` (EmptyState estándar) |
| H8, H9 | `CollectionForecast.tsx`, aging bucket render en `DashboardAlertsSection` |
| H10 | `Dashboard.tsx` (subtitle responsive) |
| H11 | `AlertCard.tsx`, `AlertsRow.tsx` |
| H12 | `FleetStatusChart.tsx` → tokens en `index.css` |

Sin cambios en RPC ni queries salvo H5 (agregar `mrr_prev_month`, `dso_prev_month`, etc. en `get_dashboard_stats`).

## Ejecución propuesta

```text
Lote A (H1–H4)  → v7.185.0  — mayor impacto visual, cero cambios de datos
Lote B (H5–H9)  → v7.186.0  — requiere ajustes menores de RPC para H5
Lote C (H10–H12) → v7.187.0 — a11y + tokens + móvil
```

Cada lote cierra con typecheck, regresión de tests y entrada de changelog. ¿Arrancamos con Lote A?
