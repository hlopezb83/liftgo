# Auditoría visual final — 1600x900

Objetivo: validar visualmente que las páginas migradas en los sprints F, G y H mantienen densidad, layout y comportamiento de filtros consistentes en la resolución estándar de escritorio (1600x900).

## Alcance

Rutas a capturar autenticado como admin contra `http://localhost:8080`:

**Sprint F/G/H — filtros + tablas migradas**
- `/invoices` — FiltersToolbar (Search + StatusTabs + DateRange + ClearAll)
- `/bookings` — nuevo FiltersToolbar (Search + StatusTabs + ClearAll)
- `/fleet` — FiltersToolbar (Search + StatusTabs)
- `/quotes`
- `/contracts`
- `/damage-tracking`
- `/customers`
- `/maintenance`

**Tablas migradas a DataTableV2**
- `/bank-reconciliation` (historial de imports)
- Panel de reconciliación dentro de `/bank-reconciliation`

**Regresión rápida**
- `/` (Dashboard)
- `/reports/mrr`
- `/accounts-payable`

## Método

1. Script Playwright único en `/tmp/browser/visual-audit-h/audit.py`:
   - Restaura sesión Supabase desde `LOVABLE_BROWSER_SUPABASE_*`.
   - Viewport fijo `1280x1800` para capturar sin scroll horizontal a 1600x900 no aplica — se usa 1600x900 vía `context.new_page` con `viewport={"width":1600,"height":900}` para replicar el estándar del usuario.
   - Recorre la lista de rutas; por cada ruta espera `networkidle`, hace screenshot en `/tmp/browser/visual-audit-h/screenshots/<slug>.png`.
   - En `/invoices` y `/bookings`: interactúa con FiltersToolbar (escribe en Search, cambia StatusTab, hace click en ClearAll) y captura antes/después para confirmar reset visual y que la tabla reacciona.
   - Registra en un `report.json` cualquier error de consola por ruta.

2. Revisión con `code--view` de cada screenshot buscando:
   - Densidad consistente (altura de filas, tipografía)
   - FiltersToolbar alineado y sin wraps rotos a 1600px
   - Botón "Limpiar filtros" aparece sólo con filtros activos
   - Zebra + sticky header en DataTableV2
   - Sin overlaps de sidebar, mobile FAB oculto en desktop

3. Reporte final en chat con hallazgos clasificados:
   - **OK**: página cumple estándar.
   - **NIT**: detalle menor (spacing, alineación, copy).
   - **BUG**: bloqueante visual o funcional (con screenshot como evidencia).

## Detalles técnicos

- No se modifica código en esta iteración; es sólo captura + reporte.
- Si aparecen BUGs, se listan al final y se propone un mini Sprint I para fixes; los NITs se agrupan como backlog visual.
- Duración estimada: 1 corrida de Playwright (~2-3 min) + revisión.

## Entregable

Resumen en chat con:
- Tabla `ruta → estado (OK/NIT/BUG) → nota`.
- Rutas de screenshots relevantes bajo `/tmp/browser/visual-audit-h/screenshots/`.
- Lista de errores de consola por ruta, si los hay.
