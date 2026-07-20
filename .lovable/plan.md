# Auditoría visual móvil — Sprint v7.106.0

Cobertura: 19 rutas capturadas a 390×844 con sesión autenticada (Playwright, `is_mobile=true`, `has_touch=true`). Cero overflow horizontal — buena base. Los hallazgos son de composición interna y polish.

## Hallazgos (con evidencia)

### UX-M-01 · Panel — Card "Facturas Vencidas" mal proporcionada
**Ruta:** `/` · **Severidad:** Alta
- Folios largos se parten en dos líneas (`FAC-\n0060`).
- Monto en rojo (`text-red-600`, weight 700, `text-lg`) tan grande que empuja "Vence:" a línea nueva y el `check` verde queda pegado al borde derecho.
- El bloque de aging chips (`0-30d / 31-60d / 61-90d`) muestra solo 3 buckets — falta `90+d` visible.
- **Fix:** en la card de "Facturas Vencidas" (`src/components/dashboard/alerts/OverdueInvoicesCard.tsx` o equivalente): (a) `whitespace-nowrap` en folio, (b) bajar monto a `text-sm font-semibold` en `<sm`, (c) apilar `Vence:` + fecha en el mismo `flex-col` a la derecha del monto, (d) mostrar los 4 buckets de aging con wrap.

### UX-M-02 · Panel — Card "Rentas Vencidas" corta ícono derecho
**Ruta:** `/` · **Severidad:** Media
- Se ve un fragmento gris del ícono cortado en el borde derecho de cada fila.
- **Fix:** revisar `pr-*` del contenedor de la fila y quitar `-mr-*` residual.

### UX-M-03 · Calendario — headers de días se pegan
**Ruta:** `/calendar` · **Severidad:** Media
- "mié jue vie sábdom lu…" sin separación visible; el header del Gantt sigue calculado con `min-w` desktop.
- Segmented controls `Gantt / Lista` y `Semana / Mes` quedan en la misma fila con gap desigual.
- **Fix:** en el header del Gantt móvil (`src/features/calendar/…/GanttHeader.tsx`), forzar `min-w-[36px]` por día y `gap-1`; en la toolbar, envolver ambos segmented en un `flex-wrap gap-2` con `w-full sm:w-auto`.

### UX-M-04 · Cotizaciones — FAB tapa contenido de última tarjeta
**Ruta:** `/quotes` (y todas las listas con FAB móvil) · **Severidad:** Alta
- El botón flotante `+` cubre el `StatusBadge` "Aceptada" de la card final. Faltan `pb-safe` al scroll container.
- **Fix:** agregar `pb-24` (o `pb-[env(safe-area-inset-bottom)+5rem]`) al contenedor de `MobileCardList` cuando exista un FAB visible. Centralizar en `MobileCardList` con prop `hasFab`.

### UX-M-05 · Reportes — gráfica de utilización ilegible en móvil
**Ruta:** `/reports` (Utilización de Flota) · **Severidad:** Alta
- 58 barras aplastadas en ~600px; eje X solo muestra 2 etiquetas. La tabla debajo se corta a la derecha ("DÍAS TOTAL…" recortado).
- **Fix:** (a) en móvil, cambiar chart a `<ScrollArea>` horizontal con `min-w={fleet*24}px`, o mostrar top-N con toggle "Ver todos"; (b) envolver la tabla del reporte en `overflow-x-auto` o migrar a `MobileCardList` (`isMobile ? MobileCardList : DataTableV2`).

### UX-M-06 · Locale error global en consola
**Ruta:** todas · **Severidad:** Media (no visible pero flood en telemetría)
- `Uncaught: Incorrect locale information provided` en cada carga (19/19 rutas).
- Probable causa: llamada a `Intl.DateTimeFormat`/`NumberFormat` con string inválida (posible `es_MX` vs `es-MX`, o valor undefined pasado como locale).
- **Fix:** grep `Intl\.` y `toLocaleString\(` bajo `src/lib/format/`, `src/components/ui/calendar.tsx` y `formatMonthEs.ts`; validar que ningún callsite pase `es_MX`, `null`, `""` o `[undefined]`. Añadir guard en helper central (`toLocale('es-MX')`).

## Fuera de alcance
- `/operations-setup` y `/supplier-bills` devolvieron 404 en el test — son rutas incorrectas de mi audit, no bugs reales. Se ignoran.

## Detalles técnicos
- Toque global: preferir `pb-[calc(env(safe-area-inset-bottom)+96px)]` para respetar notch en iPhone.
- `MobileCardList` ya usado en Facturas/Reservas/Cotizaciones/Equipos/MRR — patrón consolidado; solo falta el prop `hasFab` y aplicarlo en Reportes.
- Añadir un test Playwright liviano en `tests/e2e/mobile-visual.spec.ts` que capture `/`, `/calendar`, `/quotes`, `/reports` @ 390×844 y valide (a) `document.scrollWidth === clientWidth`, (b) FAB no intersecta última card (bounding rect check), (c) ausencia de `pageerror` con "Incorrect locale".

## Changelog
Entry `v7.106.0` — minor — "UX móvil: cards del Panel, calendario, FAB, reportes y fix de locale global".
