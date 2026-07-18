## Auditoría UI/UX @ 698×572 — hallazgos y plan de remediación

Se corrieron dos pasadas de Playwright autenticado sobre 30+ rutas al viewport 698×572 (tablet estrecho / móvil landscape). Screenshots en `/tmp/browser/audit698/shots{,2}/`.

### Hallazgos verificados en captura

| # | Sev | Ruta | Hallazgo |
|---|-----|------|----------|
| 1 | P0 | `/customers`, `/bookings` | Sin CTA primaria visible en toolbar y sin FAB. `/quotes` sí tiene FAB (inconsistente). |
| 2 | P0 | `/expenses` | Redirige a `/cuentas-por-pagar` pero muestra pantalla en blanco (~2 KB PNG) durante la resolución. Falta estado de carga. |
| 3 | P1 | Global (listas) | Botón "Filtros" ocupa fila completa `w-full` (~48px de alto) — desperdicia >8% del viewport de 572px. |
| 4 | P1 | `/maintenance` | 4 CTAs + toggle Kanban/Tabla se envuelven en 2–3 filas (~120px) apretando la lista bajo el fold. |
| 5 | P1 | `/flujo-de-caja` | Tabla desborda: columna "ESTADO" (semáforo) queda pegada al borde derecho sin scroll horizontal visible; encabezados en negrita también se cortan. |
| 6 | P1 | `/income-statement` | Botones "CSV" y "PDF" quedan bajo el fold (572px); usuario debe scrollear para exportar. Los KPIs consumen ~470px verticales. |
| 7 | P1 | `/settings/operations` | 7 tabs de configuración saltan a 3 filas verticales — patrón inconsistente con `StatusTabs` (que ya adoptamos con scroll horizontal). |
| 8 | P2 | `/reports` | Gráfica "Utilización de Flota" con barras aplastadas contra el eje Y; densidad de labels no se ajusta al ancho. |
| 9 | P2 | `/cuentas-bancarias` | Tabla 6-col comprimida sin `MobileCardList` fallback bajo `md` (patrón ya usado en MRR). |
| 10 | P2 | `/crm` | 3 selectores de filtro + búsqueda apilados en 4 filas empujan el pipeline bajo el fold — sólo asoman cabeceras de columna. |
| 11 | P3 | `/help`, `/changelog` | OK — sin issues. |

Descartados tras re-verificar (falsos positivos del primer barrido con `wait_until="domcontentloaded"`): dashboard blank, CRM esqueleto, MRR icon overlap.

### Plan de remediación

**Lote A — Toolbar de listas (P0)**  
- Estandarizar la barra de acciones de `CustomersPage`, `BookingsPage` y `QuotesPage`: CTA primaria visible en el toolbar (no FAB) usando el mismo patrón de `InvoicesPage` / `FleetPage` (`Nuevo Cliente`, `Nueva Reserva`, `Nueva Cotización`).
- Retirar el FAB flotante duplicado de `/quotes` (queda inline).
- Convertir el botón "Filtros" en `size="sm"` inline dentro del toolbar (no full-width) — impacta `ListPageLayout` y/o `FiltersToolbar`.

**Lote B — Estados vacíos / redirects (P0)**  
- Reemplazar el redirect `loader` de `/expenses` con `<Navigate to="/cuentas-por-pagar" replace />` desde un componente ligero para evitar el flash en blanco durante import lazy.

**Lote C — Densidad y overflow (P1)**  
- `MaintenancePage`: unificar CTAs bajo un patrón compacto (primario + kebab overflow "Más") en `<md`.
- `CashFlowPage`: envolver la tabla en `overflow-x-auto` con hint visual y añadir sticky columna "SEM." para lecturas de arriba a abajo.
- `IncomeStatementPage`: mover botones CSV/PDF al header (junto al selector de rango) para que queden sobre el fold.
- `OperationsSetupPage`: aplicar `overflow-x-auto` + `whitespace-nowrap` a la lista de tabs (mismo patrón de `StatusTabs`).

**Lote D — Fallbacks móviles y detalle (P2)**  
- `BankAccountsPage`: agregar `MobileCardList` bajo `md` con nombre / banco / últimos 4 / saldo.
- `CRMPage`: colapsar los 3 selectores en un botón "Filtros" desplegable bajo `md` para dar aire al pipeline.
- `ReportsPage`: forzar `min-width` responsivo al `<ResponsiveContainer>` de barras y adelgazar `barCategoryGap` para viewports <700px.

**Lote E — Verificación**  
- Re-correr Playwright 698×572 sobre las 10 rutas afectadas y adjuntar `after/` screenshots.
- Sumar tests unitarios para el toolbar unificado (`CustomersPage`, `BookingsPage`, `QuotesPage`) verificando presencia de la CTA en el DOM.

### Detalles técnicos

- Rutas afectadas confirmadas en `src/routes/routes-config.tsx`.
- Patrones de referencia ya en uso: `MobileCardList` (v7.78.0 en MRR), `StatusTabs` con scroll horizontal (v7.79.0), `useTableFilters` (v7.62.0).
- El redirect actual `{ path: "/expenses", loader: () => redirect("/cuentas-por-pagar") }` se resuelve en el data router antes del render — el flash en blanco proviene del código lazy que se carga al inicio; probar migrando a `<Navigate>` en un componente estático mejora percepción de latencia.
- Nuevo changelog planeado: **v7.81.0** (minor — múltiples ajustes de UX en la app).

### Fuera de alcance

- Regeneración de baselines visuales E2E (Sprint J pendiente).
- Refactor del sidebar en tablet (colapsable ya funciona).
- Reescritura del Kanban de CRM/Mantenimiento (dnd-kit v7.60.0 estable).

¿Arrancamos con Lote A + Lote B (los P0) en el próximo sprint, o prefieres ejecutar los 4 lotes A–D en una sola pasada v7.81.0?
