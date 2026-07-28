Las tres oleadas ya están entregadas parcialmente (v7.241.0, v7.242.0, v7.243.0). Este plan cierra los ítems que quedaron fuera por scope.

## Ola 2 pendientes

**B-3 · Empty states con CTA** — Auditar módulos principales (Clientes, Cotizaciones, Facturas, Contratos, Flota, Mantenimiento, Inventario, Prospectos) y reemplazar el `EmptyRow` genérico por `EmptyState` con botón "Nuevo X" que dispara el mismo flujo del header. Un solo componente `EmptyStateCTA` reutilizable.

**B-7 · Footer estandarizado en drawers/diálogos** — Convención: Cancelar a la izquierda, Guardar/Confirmar a la derecha, botón destructivo separado por spacer. Aplicar a `FormDialog`, `ConfirmDialog`, `Sheet` de detalle.

**B-8 · Layout de Conciliación Bancaria** — Refactor a dos columnas (movimientos bancarios | movimientos del sistema) con panel de match al centro. Alto scope; requiere levantar la página actual y rehacer grid.

**B-9 · `AlertDialog` → `ConfirmDialog`** — Migrar los `AlertDialog` sueltos a `ConfirmDialog` (ya existe) y pasar `variant="destructive"` donde aplique (eliminar factura, cancelar CFDI, borrar cliente). Quitar el `AlertDialog` de las importaciones.

**B-11 · CRM Kanban optimista + drag directo + empty state** — Mover la carta en cache al soltar (sin esperar RPC), rollback en error, arrastre desde toda la carta (no sólo el handle), empty state por columna con CTA "Nuevo prospecto".

## Ola 3 pendientes

**C-2 · Facelift Portal de Clientes** (10 páginas)
- `PortalLogin`: fondo con gradiente radial suave, `BrandMark` (ya creado), microcopy es-MX, footer "Powered by LiftGo".
- Layout común: header sticky con `BrandMark` + cliente logueado + menú, nav horizontal (Inicio / Rentas / Cotizaciones / Facturas / Estado de cuenta), contenedor `max-w-5xl mx-auto`.
- `PortalDashboard`: 3-4 `KpiTile` uniformados con `formatCompactCurrency` + `kpiSizeClass` (Ola 3 helpers), sección "Próximos vencimientos".
- Tablas del portal: reutilizar `StatusBadge` + zebra del sistema + `ColumnMeta.kind` (Ola 3 C-1).

**C-7 · Gráficas de reportes legibles** — Paleta desde tokens (`hsl(var(--primary))`, `--accent`, `--muted-foreground`, `--destructive`, máx 4 series), ejes Y con `formatCompactCurrency` como `tickFormatter`, tooltips con `formatCurrency` + fecha es-MX, grid horizontal `strokeDasharray="3 3"`, altura mínima 240px, estados vacíos con `EmptyState`. Alcance: gráficas de Ingresos, Utilización, Flujo de Caja, MRR.

## Orden sugerido

1. **B-9** y **B-7** (rápidos, sin riesgo).
2. **B-3** empty states (impacto visual alto, bajo riesgo).
3. **C-2** portal (cara pública — antes de mostrar app a clientes).
4. **C-7** gráficas (usa helpers de Ola 3).
5. **B-11** CRM optimista.
6. **B-8** conciliación (mayor scope, al final).

## Detalles técnicos

- `EmptyStateCTA`: extender el `EmptyState` actual con props `actionLabel` + `onAction` o `href`.
- CRM optimista: usar `queryClient.setQueryData` + `onMutate/onError` de `useMutation` (patrón ya usado en otras mutations).
- Gráficas: revisar librería en uso (`Recharts` según stack); crear helper `chartTheme.ts` con colores y formatters, aplicarlo a todos los `<XAxis tickFormatter>`, `<Tooltip formatter>`.
- Portal: crear `PortalLayout.tsx` con header + nav + container, envolver rutas del portal en él.

## Fuera de scope

- Migración masiva de todas las columnas de todas las tablas a `kind` (C-1 base ya entregada; se hace tabla por tabla en oleadas siguientes).
- View Transitions API (C-5 opcional, saltado por complejidad).

## Preguntas antes de arrancar

¿Empezamos por **todo el bloque en orden** (grande, ~1 día), o prefieres **una sola tanda pequeña** (B-9 + B-7 + B-3, empty states + destructivos) para validar y seguir?
