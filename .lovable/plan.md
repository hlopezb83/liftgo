

## Hacer clicables las 4 tarjetas KPI del Dashboard

### Mapeo de cada tarjeta a su destino

| Tarjeta | Página destino | ¿Existe? |
|---|---|---|
| Ingreso Mensual Recurrente | `/income-statement` (Estado de Resultados) | ✅ Sí |
| Utilización de Flota | `/reports` con reporte "Utilización de Flota" preseleccionado | ✅ Sí |
| DSO (Días de Cobro) | `/reports` con reporte "Antigüedad de Cartera" preseleccionado | ✅ Sí |
| Cartera Vencida | `/invoices?status=overdue` (Facturas filtradas por vencidas) | ✅ Sí |

Todas las páginas relevantes ya existen. No es necesario crear nuevas páginas — solo necesitamos navegar a ellas con los filtros/parámetros correctos.

### Cambios

**1. `src/components/dashboard/FinancialKpiCards.tsx`**
- Agregar `href` a cada definición de KPI con la ruta destino.
- Para Reportes, usar query params como `/reports?type=utilization` y `/reports?type=aging`.
- Envolver cada tarjeta en un `Link` de react-router-dom (o usar `useNavigate` con `onClick`).
- Agregar cursor pointer y efecto hover visual para indicar que son clicables.

**2. `src/pages/ReportsPage.tsx`**
- Leer el query param `type` de la URL al inicializar el estado `reportType`, para que al llegar desde el dashboard se abra el reporte correcto automáticamente.

**3. `src/pages/InvoicesPage.tsx`**
- Verificar que el filtro por `status` desde query params ya funcione (si usa `useListFilters` con `sessionStorage`, puede que necesite aceptar el param `status=overdue` de la URL).

### Archivos
- `src/components/dashboard/FinancialKpiCards.tsx` — hacer tarjetas clicables con navegación
- `src/pages/ReportsPage.tsx` — leer query param para preseleccionar reporte
- `src/pages/InvoicesPage.tsx` — verificar/ajustar filtro por query param

