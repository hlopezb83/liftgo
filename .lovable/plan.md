# Auditoría UI/UX — 698×572 (tablet vertical estrecho)

Basado en capturas de Playwright autenticadas en 15 rutas: `/`, `/fleet`, `/customers`, `/quotes`, `/bookings`, `/invoices`, `/maintenance`, `/suppliers`, `/cuentas-por-pagar`, `/mrr`, `/income-statement`, `/expenses`, `/activity`, `/deliveries`, `/returns`.

El viewport cae entre `sm` (640) y `md` (768) de Tailwind, así que hereda estilos "mobile" pero con más ancho: es donde el diseño está peor calibrado. Todas las capturas están en `/tmp/browser/mobile-audit/screenshots/`.

## Hallazgos por severidad

### P0 — Bloquean lectura/uso

1. **`/mrr` renderiza tabla desktop que se desborda**. La columna PERIODO queda cortada y la scroll horizontal no es evidente. Contradice la regla `MobileCardList` para mobile/tablet estrecho.
2. **Encabezados de página consumen ~30% del viewport visible**. Con topbar (60px) + `PageHeader` (title 4xl + subtitle lg + `mb-6`) se comen ~220 px antes del primer contenido en un viewport de 572 px de alto. Baja severamente la densidad útil.
3. **Barra "Filtros" full‑width solitaria**. En `/customers`, `/quotes`, `/bookings`, `/invoices`, `/suppliers`, `/cuentas-por-pagar`, `/maintenance`, `/returns` el botón `Filtros` ocupa una fila entera de ~62 px sin barra de búsqueda contigua. Debería ser una `ListToolbar` compacta (Search + Filtros + count) en una sola línea.
4. **`/expenses` muestra el listado de "Facturas de Proveedor"**. Ruta duplicada o redirect mal — hay que verificar en el router.

### P1 — Consistencia de sistema de diseño

5. **StatusBadge inconsistente**. Deliveries usa "Programado" en pill sólido azul con texto blanco; Bookings/Invoices/Returns usan pill outline/soft. Suppliers muestra el chip "Mantenimiento" en variante oscura mientras que Bookings usa "Recurrente" en variante suave.
6. **Chevron/affordance de tap inconsistente**. `Clientes`, `Cotizaciones`, `Reservas` tienen chevron `>` en la card; `Facturas`, `Facturas de Proveedor`, `Devoluciones` no.
7. **FAB "Agregar" flotante duplica el CTA superior**. En `/quotes` y `/customers` coexisten el botón "Nueva…" del header y el FAB inferior; el FAB además tapa la última card (sin `pb-24` de safe area). Debe mostrarse el FAB solo cuando el CTA del header queda fuera del viewport.
8. **Sección "Actions" de header envuelve mal**. En `/invoices` y `/cuentas-por-pagar` los tres botones (`Generar…`/`Antigüedad`, `Exportar`, `Nueva`) se salen a otra línea o quedan apretados. En `/maintenance` los cinco controles (ToggleGroup + 3 botones + CTA) se apilan sin jerarquía.
9. **`/income-statement`: acciones `CSV`/`PDF` flotan bottom‑right encima del contenido**. Deben ir dentro de un `ListToolbar` o al final del reporte.

### P2 — Densidad y contenido

10. **Dashboard KPI grid es 2×N con cards enormes que sólo muestran número + etiqueta**. En 698 px cabría un grid 2×2 más compacto (icon+label izq / número derecha, alto ~72 px). Actualmente cada card ~140 px altura.
11. **Cards de listado con jerarquía débil**:
    - `Cotizaciones`: falta cliente real (solo se ve "PÚBLICO EN GENERAL"), badge tipo "Renta" mezclado con folio.
    - `Reservas`: falta monto/valor rentable — el usuario tiene que abrir para saber el ticket.
    - `Facturas de Proveedor`: la fila "Saldo $11,600 / $11,600" es redundante cuando saldo == total; hay que colapsar y mostrar solo saldo.
    - `Proveedores`: no muestra teléfono ni categoría cuando existe.
12. **`/deliveries` no muestra contador ni filtros**. Todas las demás listas incluyen "N resultados" en el subtítulo — inconsistencia.
13. **Breadcrumb + botón sidebar + botón search + botón feedback en la topbar** compiten con el título de página inmediatamente debajo. Se puede fusionar breadcrumb + título (un solo H1 con back chevron) para ahorrar ~50 px.

### P3 — Pulido

14. **Botón "Filtros" alto (62 px)** con icono grande — debe ser `size="sm"` (36 px).
15. **`text-lg` en subtítulos de `PageHeader`** compite con el título; bajar a `text-sm text-muted-foreground`.
16. **`Devoluciones y Revisión`** — el título envuelve porque el H1 es demasiado grande.
17. **Cards de `/fleet` con chevron pero sin foto/última actividad** — hay ancho de sobra para un thumb 40 px.

## Plan de sprint (v7.78.0 — 4 lotes)

### Lote A — Estandarización de `ListToolbar` y `PageHeader` (P0/P1/P3)
- Nuevo componente `ListToolbar` que fusiona SearchBar + Filtros + contador + acciones en una sola fila responsiva (wrap a 2 filas < 640 px).
- Actualizar `PageHeader` para variante `compact` en <768 px: title `text-2xl`, subtitle `text-sm`, `mb-3`.
- Migrar las 10 listas afectadas a la nueva toolbar.
- Añadir contador a `/deliveries`.

### Lote B — `MobileCardList` para `/mrr` y consistencia de badges (P0/P1)
- Reemplazar la tabla en `MRRDetailPage` por `MobileCardList` bajo `md`.
- Unificar `StatusBadge` en `Deliveries` (variante soft) y en `Suppliers` (chip de categoría con variante `secondary` suave).
- Añadir chevron a Facturas / Cuentas por Pagar / Devoluciones.

### Lote C — Fix de ruta `/expenses` y FAB inteligente (P0/P1)
- Verificar el mapping en `src/routes/router.tsx` y `src/routes/routes.ts`: `/expenses` debería resolver la página de gastos operativos, no la de facturas de proveedor.
- FAB: mostrar solo cuando el CTA del header queda fuera del viewport (IntersectionObserver del botón principal) y agregar `pb-24` global al scroll de listas.

### Lote D — Densidad Dashboard + acciones de reportes (P1/P2)
- KPI cards del dashboard: variante `dense` a <768 px (72 px altura, icono 20 px, número `text-xl`).
- Estado de Resultados: sacar `CSV`/`PDF` flotantes al `ListToolbar` superior, junto al toggle Devengado/Flujo.
- `Maintenance`: colapsar acciones secundarias en menú `⋯` cuando <900 px.

## Detalles técnicos

- Puntos de código clave:
  - `src/components/layout/PageHeader.tsx`, `src/components/layout/ListToolbar.tsx`, `src/components/layout/MobileCardList.tsx`.
  - `src/features/dashboard/**` para el grid KPI y el enlace a `/mrr`.
  - `src/features/mrr/**` (o donde viva `MRRDetailPage`) para reemplazar la tabla.
  - `src/features/deliveries/pages/DeliveriesPage.tsx` (falta count + filtros; badge sólido en `renderDeliveryMobileCard` o `StatusBadge`).
  - `src/features/accounts-payable/pages/CuentasPorPagarPage.tsx` (acciones y chevron).
  - `src/routes/router.tsx` para el fix `/expenses`.
- Tests: extender `tests/e2e/visual-mobile.spec.ts` a viewport 698×572 y regenerar baselines dentro del sprint.
- Changelog: agregar `public/changelog/v7.78.0.json` (minor) al finalizar el lote D con un resumen por lote.
- Nota de compatibilidad: no requiere migraciones; todo el trabajo vive en frontend/presentación.

## Fuera de alcance de este plan

- Refactor del sidebar/topbar (P1 hallazgo #13 se aborda parcialmente con el `PageHeader compact`, no reestructuramos navegación).
- Cambios en Kanban de Mantenimiento — el viewport es incompatible por diseño; se colapsa a lista.

¿Aprobamos y arrancamos con el Lote A?
