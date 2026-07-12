## Contexto

Auditoría visual con 4 subagentes en paralelo (2 completaron capturas Playwright reales en `/tmp/browser/`, 2 no pudieron ejecutar navegador en su entorno). Verifiqué manualmente el hallazgo #1 leyendo `src/layouts/MainLayout.tsx` y viendo el screenshot `/tmp/browser/dashboard/desktop/mrr.png`: **el sidebar tapa el título y las primeras columnas** en desktop y tablet. Root cause: tras la actualización a shadcn sidebar moderno + Tailwind v4, el componente `<Sidebar>` se renderiza como `position: fixed`; sin `<SidebarInset>` como hermano, el `<main class="flex-1">` no recibe el offset del ancho del sidebar y se solapa.

## Fallas priorizadas (evidencia en `/tmp/browser/`)

### CRÍTICO — bloquea uso en desktop y tablet

1. **Sidebar tapa contenido en todas las rutas** — `src/layouts/MainLayout.tsx:65-91`. El `<main>` no está dentro de `<SidebarInset>`. Se ve en `dashboard/desktop/mrr.png` (título "MRR recurrente" y primeras columnas tapadas) y `dashboard/tablet-portrait/mrr.png`. Afecta toda la app.

### WARNING — degradan lectura

2. **Sticky `TableHeader` translúcido** — `src/components/ui/table.tsx:16`. `bg-muted/50` deja ver el contenido debajo al hacer scroll. Reducir opacidad → `bg-card` o `bg-muted` sólido + `backdrop-blur` opcional.
3. **Wrapper de tabla con altura rígida** — `src/components/ui/table.tsx:7`. `max-h-[calc(100vh-20rem)]` genera scrollbars innecesarios en listas cortas y desperdicia espacio. Delegar altura al layout de la página (`ListPageLayout` ya la controla).
4. **Grid KPI dashboard inconsistente** — `src/features/dashboard/components/dashboard/StatCards.tsx`. Fila 2 (Utilización, DSO) con anchos distintos a fila 1. Verificar `grid-cols-*` uniforme.
5. **Tablas /mrr en tablet-portrait** — columnas CLIENTE y PERIODO wrappean agresivo. Añadir `min-w-*` o truncar con tooltip en columnas de fecha.
6. **`TableHead` uppercase + `tracking-wider`** — provoca saltos de línea en columnas densas en tablet. Reducir `tracking` o quitar `uppercase` en tablas densas.

### BAJO — inconsistencias visuales menores

7. **CTA duplicado en `/suppliers`** — el botón "Nuevo" se declara vía `usePageActions` Y en el prop `actions` de `ListPageLayout`. Elegir una fuente única.
8. **FAB mobile inconsistente** — `CustomersPage` implementa `mobileFab` manual; el resto delega en `ListPageLayout`. Consolidar en el layout.

## Plan de ejecución (por lotes)

### Lote 1 — CRÍTICO: reparar layout global (bloqueante)

- `src/layouts/MainLayout.tsx`: importar `SidebarInset` de `@/components/ui/sidebar`, reemplazar `<main …>` por `<SidebarInset asChild><main …></main></SidebarInset>` (o envolver directo si `SidebarInset` ya renderiza `<main>`). Verificar que `min-h-[100dvh] flex w-full` sigue siendo válido y que `SidebarInset` no rompe `sticky top-0` del header interno.
- Verificación: capturar `/`, `/mrr`, `/customers`, `/quotes` a 1440x900, 1024x768, 768x1024 con Playwright y comparar contra screenshots del subagente. Sidebar debe empujar el contenido, no taparlo. Confirmar que el `SidebarTrigger` sigue funcionando en el topbar.

### Lote 2 — WARNING: tabla base

- `src/components/ui/table.tsx`: (a) header sólido `bg-card` con borde inferior en vez de `bg-muted/50`; (b) quitar `max-h-[calc(100vh-20rem)]` del wrapper y dejar que el contenedor de página controle altura. Auditar consumers para asegurar que la lista sigue teniendo scroll (spot-check en `/customers`, `/quotes`, `/invoices`).
- `TableHead` en `table.tsx`: mantener `uppercase` pero reducir `tracking-wider` → `tracking-wide` o quitar; verificar contra `maintenance_tablet.png`.

### Lote 3 — WARNING: dashboard y /mrr

- `src/features/dashboard/components/dashboard/StatCards.tsx`: uniformar grid para que ambas filas usen la misma cantidad de columnas y anchos (probablemente `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` estable).
- `src/features/dashboard/pages/MrrDetailPage.tsx`: `min-w` en columnas CLIENTE (200px) y PERIODO (180px); truncar con tooltip cuando exceda.

### Lote 4 — BAJO: consistencia CTA / FAB

- `SuppliersPage`: eliminar duplicación del CTA "Nuevo proveedor" (una sola fuente).
- `CustomersPage`: eliminar `mobileFab` manual y delegar en `ListPageLayout`.

### Verificación al cierre de cada lote

- `bun run lint` (0 errores).
- `bun run build`.
- Capturas Playwright antes/después en `/tmp/browser/audit-after/` para las rutas afectadas del lote.
- `bunx vitest run` al final (solo Lote 1-2 tocan código compartido).

### Changelog

- `v7.40.0` **minor** — "Fix crítico de layout global: `SidebarInset` restaurado + estabilización de tabla base y dashboard en desktop/tablet post Tailwind v4". Un único changelog al final del sprint (o uno por lote si el usuario prefiere granular — pregunto abajo).

## Detalles técnicos

- El bug del sidebar es una regresión estructural, no un cambio de tokens. `SidebarInset` es el helper de shadcn que renderiza el `<main>` con `md:peer-data-[state=expanded]:pl-[var(--sidebar-width)]` (o equivalente), imprescindible cuando el sidebar es `fixed`.
- El header interno (`sticky top-0 z-30`) del `<main>` debe seguir funcionando dentro de `SidebarInset`; validar que no se le aplique `overflow` propio que rompa el sticky.
- Los subagentes 3 y 4 no lograron capturas (falta de auth seed y libglib respectivamente). Si tras Lote 1-3 quedan dudas de detalles/dialogs, corro yo Playwright directamente con la sesión inyectada (`LOVABLE_BROWSER_AUTH_STATUS=injected`) en Lote 5 opcional.

## Riesgo

- `SidebarInset` puede afectar breakpoints `md:` del sidebar colapsable; si el usuario dependía del comportamiento actual en mobile, validamos en 375px antes de cerrar Lote 1.
