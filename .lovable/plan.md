Estado verificado hoy en el código: `EmptyState` ya acepta `actionLabel`/`onAction`, `ConfirmDialog` ya reemplazó los `AlertDialog` sueltos (no queda ninguno fuera de `components/ui`), `chartTheme.ts` existe y ya lo usan Ingresos y Costos de Mantenimiento, y el login del portal ya tiene el facelift. Falta lo siguiente.

## 1. B-3 · Empty states con CTA en tablas
Hoy las tablas caen en `EmptyRow` (icono + texto, sin acción). Plan:
- Permitir que `DataTableV2` reciba `emptyAction` (`{ label, onAction }`) y lo pase a `DataTableBodyV2` / `VirtualBody`, que renderizarán `EmptyState` con botón dentro de la celda de ancho completo en vez de `EmptyRow`.
- Conectar el CTA en: Clientes, Cotizaciones, Facturas, Contratos, Flota, Mantenimiento, Inventario y Prospectos, reutilizando la misma acción del botón "Nuevo X" del header (los `useListPage`/`useDialogState` ya la exponen).
- Cuando hay filtros activos, el mensaje será "Sin resultados con estos filtros" y el CTA será "Limpiar filtros" en lugar de "Nuevo X".

## 2. B-7 · Footer estandarizado en diálogos
- Convención: Cancelar a la izquierda, acción primaria a la derecha, destructivo separado por spacer.
- Ajustar `FormActions` a `flex justify-between` (Cancelar primero en el DOM, primaria a la derecha) y verificar `FormDialogFooter` y `ConfirmDialog` para que compartan el mismo espaciado y orden.
- Barrido de los diálogos que arman su footer a mano para que usen `FormActions`.

## 3. C-2 · Facelift del portal de clientes (páginas internas)
- `CustomerPortalLayout`: usar `BrandMark` en el header, header sticky, y contenedor `max-w-5xl mx-auto` para el contenido.
- `PortalDashboard`: migrar las tarjetas a `KpiTile` con `formatCompactCurrency` + `kpiSizeClass`, y agregar sección "Próximos vencimientos" a partir de las facturas no pagadas.
- Tablas del portal (Rentas, Cotizaciones, Facturas, Contratos, Estado de cuenta): `StatusBadge` + zebra del sistema + `ColumnMeta.kind` para montos y fechas, y `EmptyState` en lugar de textos sueltos.

## 4. C-7 · Gráficas restantes con tema unificado
- Aplicar `chartTheme.ts` (paleta por tokens, `chartGridProps`, `formatCompactMxn` como `tickFormatter`, `tooltipCurrencyFormatter`, altura mínima) a: `CashFlowChart`, `UtilizationCharts`, `FleetStatusChart`, `CollectionForecast`, `ProfitabilityChart`, `AgingReport` y `UtilizationReport`.
- Estados vacíos de gráficas con `EmptyState`.

## Fuera de alcance
- **B-8 (rediseño a dos columnas de Conciliación Bancaria)**: se mantiene diferido; es un rehacer completo de la página y merece su propia tanda.

## Detalles técnicos
- Sin cambios de base de datos ni de lógica de negocio: todo es presentación.
- `EmptyState` ya soporta CTA; sólo falta el puente desde `DataTableV2`.
- Al terminar: nueva entrada `public/changelog.json` + `public/changelog/v7.245.0.json` (minor).
