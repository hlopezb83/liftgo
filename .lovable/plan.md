
# Auditoría Visual LiftGo — 1920×1080

Objetivo: cohesión visual total. Un solo lenguaje de diseño en toda la app, sin parches, sin estilos mezclados.

Entregable por fase: reporte estructurado + capturas antes/después (Playwright a 1920×1080) + fixes aplicados al código en el mismo pase. Todo el reporte final se guarda en `/mnt/documents/ui-audit/`.

---

## Fase 0 — Instrumentación (una sola vez)

- Script Playwright reutilizable `/tmp/audit/capture.py` que:
  - Restaura sesión Supabase (hlopezb@gmail.com, admin).
  - Navega a lista de rutas, captura viewport 1920×1080 (no full_page).
  - Guarda en `/mnt/documents/ui-audit/before/<ruta>.png` y `after/<ruta>.png`.
- Índice de hallazgos: `/mnt/documents/ui-audit/report.md` (categorizado por severidad).

## Fase 1 — Auditoría global del Design System

Alcance: `src/index.css`, `tailwind.config.ts`, `src/components/ui/*` (Button, Card, Dialog, Table, Input, Select, Badge, Tabs, Tooltip, Sheet), layouts (`MainLayout`, `AppSidebar`, headers).

Checklist:
1. **Tokens de color**: verificar que todos los `--status-*`, `--gantt-*`, `--sidebar-*` estén en HSL y usados vía `hsl(var(--x))`. Detectar `text-white`, `bg-black`, `bg-[#...]`, `text-gray-*` hardcoded en componentes.
2. **Tipografía**: una sola familia (Inter) + mono (JetBrains). Escala documentada (text-xs 12, sm 13, base 14, lg 16, xl 18, 2xl 20, 3xl 24). Pesos permitidos: 400/500/600/700. Detectar mezclas (font-medium vs font-semibold para el mismo rol) y usos de font-bold sueltos.
3. **Spacing**: escala Tailwind (1, 2, 3, 4, 6, 8). Prohibir valores arbitrarios `p-[13px]`, `gap-[7px]`. Padding de página unificado (`p-6` en desktop). Gaps de card unificados (`space-y-4` internos, `gap-4` entre cards).
4. **Radios y sombras**: un solo `--radius`. Sombras vía tokens (`shadow-sm`, `shadow`, `shadow-md`), no `shadow-[...]` arbitrarias.
5. **Componentes base**: Button (5 variantes máx), Card (header/content/footer con padding fijo), Dialog (header sticky, footer sticky, max-w consistente), Input/Select (misma altura h-9 o h-10 — elegir una), Badge (mismo padding y radius), Table (misma densidad, header sticky, zebra opcional).
6. **Sidebar & Header**: alturas fijas, alineación de iconos 20×20, gap consistente, colores desde `--sidebar-*`.
7. **Estados**: hover, focus-visible (ring token), disabled (opacity-50 estándar), loading (mismo Skeleton).

Fix inmediato: parche a `index.css` + `tailwind.config.ts` para consolidar escala y radio; refactor de componentes base violatorios; util `cn` para reemplazar clases hardcoded.

## Fase 2 — Top 5 módulos críticos

Auditoría pantalla por pantalla, viewport 1920×1080, sesión admin real:

1. **Dashboard** (`/`) — KPIs, alertas, gráficas.
2. **Reservas / Calendario** (`/bookings`, `/calendar`) — Gantt, listas, drill-down.
3. **Cotizaciones** (`/quotes`, detalle) — formulario multi-equipo, totales.
4. **Facturación** (`/invoices`, detalle, PDF preview) — tablas de pagos, CFDI, complementos.
5. **Cuentas por Pagar** (`/accounts-payable`, detalle) — aprobaciones, pagos, batches.

Por cada pantalla:
- Captura antes 1920×1080.
- Checklist:
  - Bugs de layout (elementos que no ocupan el ancho disponible, tablas encogidas a 60% con hueco a la derecha).
  - Overflows (texto cortado, tooltips ausentes en celdas con truncate).
  - Alineaciones (columnas numéricas a la derecha, headers alineados con datos).
  - Spacing (padding de sección, gaps entre cards, márgenes de headers).
  - Tipografía (jerarquía H1/H2/H3, tamaños de KPI, labels de tabla).
  - Consistencia con Fase 1 (botones, badges, dialogs).
- Fix aplicado en el mismo pase.
- Captura después.

## Fase 3 — Reporte final

`/mnt/documents/ui-audit/report.md` con:
- Resumen ejecutivo (nº hallazgos por categoría y severidad).
- Sección global (Fase 1) con diff de tokens y componentes.
- Sección por módulo (Fase 2) con: hallazgo, severidad, captura antes, captura después, snippet aplicado.
- Anexo: reglas de estilo para prevenir regresiones (para agregar a `mem://design/*`).

`<presentation-artifact path="ui-audit/report.md" mime_type="text/markdown"></presentation-artifact>` al final.

## Reglas de ejecución

- No tocar lógica de negocio, hooks de datos, RPCs. Solo presentación (`className`, tokens CSS, estructura JSX).
- Cero `!important`, cero `as any`, cero valores arbitrarios nuevos.
- Cada archivo tocado registra entrada en `public/changelog.json` + `public/changelog/vX.Y.Z.json` al cerrar cada fase (no por cada archivo).
- Si un fix cambia altura/estructura de un componente compartido, verificar los 5 módulos antes de commit.

## Fuera de alcance

- Móvil / tablet (usuario confirmó solo 1920×1080).
- Dark mode (a menos que aparezca roto en la auditoría global — se reporta pero no se corrige en esta iteración).
- Módulos fuera del top 5 (Flota, Mantenimiento, CRM, Reportes, Configuración): se reportan hallazgos globales que los afectan vía Fase 1, pero no se auditan pantalla por pantalla.

## Detalle técnico

- Playwright ya instalado, Chromium bundled. Viewport `{width: 1920, height: 1080}`.
- Sesión inyectada vía `LOVABLE_BROWSER_SUPABASE_*` (status: injected).
- Screenshots PNG sin `full_page`.
- Diffs de tokens: unified diff en el reporte.
- Snippets: bloques ```tsx / ```css con path y line range.

## Estimación

- Fase 1: 1 iteración grande (tokens + componentes base).
- Fase 2: 1 iteración por módulo (5 iteraciones).
- Fase 3: 1 iteración de consolidación.

Total: ~7 iteraciones. Puedo empezar por Fase 1 y pausar para tu revisión antes de Fase 2.
