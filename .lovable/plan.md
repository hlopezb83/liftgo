
# Auditoría UI/UX — Fase 3: Cohesión final

Fases anteriores (v6.98.0 y v6.98.1) cubrieron routing, sidebar, variantes de `Alert` y migración masiva de ~30 archivos a tokens semánticos (`success`, `warning`, `destructive`, `info`). Esta fase cierra los focos restantes detectados en una pasada 1920×1080.

## Hallazgos

### 1. Residuos de color hardcoded (15 archivos)

**Estados** (deben usar tokens semánticos):
- `RepBadge.tsx`, `InvoiceCreditNotesCard.tsx`: `bg-green-600/700` → `bg-success`.
- `AlertCard.tsx`, `AlertsRow.tsx`, `MaintenanceKanban.tsx`, `ProspectCard.tsx`: `orange-50/600/200/800` → `warning` (orange y amber comparten semántica).
- `BankStatementLinesTable.tsx`: `zinc-200/700` y `amber-100/900` → `muted` y `warning`.
- `SupplierBillCfdiDropzone.tsx`: `border-emerald-900` → `border-success/30`.
- `lib/constants.ts`: paleta UI (`bg-red-600`, `bg-emerald-600`, etc.) → revisar caso por caso; los badges sólidos pasan a `bg-{success|destructive|info}` y mantienen `text-{...}-foreground`.

**Categorías** (paleta cualitativa, no de estado): `FeedbackStatusBadge.tsx`, `CalendarStatCards.tsx` mezclan `purple/cyan/violet/teal`. Mantener variedad cromática pero anclarlas a los tokens `--chart-1`…`--chart-5` ya definidos en `index.css`, así dark/light se respetan automáticamente.

### 2. PageHeader no se aplica de forma uniforme

19+ páginas escriben `<h1 className="text-2xl font-bold">` inline en vez de usar `<PageHeader>`. Pesos mezclados: `font-bold` (mayoría), `font-semibold tracking-tight` (feedback), `text-4xl` (NotFound).

Migrar al componente único:
- Páginas portal (`PortalQuotes`, `PortalRentals`, `PortalInvoices`, `PortalContracts`, `PortalStatement`, `PortalDashboard`, `PortalQuoteDetail`, `PortalInvoiceDetail`, `PortalInvoicePayment`).
- Páginas internas (`Dashboard`, `AgingReportPage`, `MrrDetailPage`, `CRMClosedPage`, `MyReportsPage`, `LeaderboardPage`, `FeedbackManagementPage`).

Ajustar `PageHeader` para soportar `backHref` opcional (lo usan algunas vistas de detalle hoy con botones ad hoc) y dejar el `<h1>` con un único estilo: `text-xl sm:text-2xl font-semibold tracking-tight`.

### 3. Inconsistencia de wrapper y spacing

Páginas alternan `p-6 space-y-6`, `space-y-6 max-w-5xl`, `space-y-4 p-4 md:p-6`, `px-6 py-4 space-y-4`. El layout principal ya aplica padding, así que la doble aplicación produce columnas más angostas en unas vistas que en otras a 1920px.

- Adoptar wrapper único `PageContainer` con `space-y-6` y sin `p-*` (el padding vive en `MainLayout`).
- Reservar `max-w-*` sólo para vistas de detalle (formularios), no para listados, para que las tablas aprovechen el ancho 1080p.

### 4. Tipografía secundaria

Tamaños sueltos (`text-xs`/`text-sm`) abundan pero sin convenciones. Definir reglas y dejar utilidades documentadas en `index.css` (`@layer components`):
- `text-sm font-medium` para labels de tablas.
- `text-xs uppercase tracking-wide text-muted-foreground` para small-caps de secciones (ya usado en form dialogs, propagar a cards de detalle).

## Implementación

1. **Tokens y residuos**
   - `RepBadge`, `InvoiceCreditNotesCard`, `AlertCard`, `AlertsRow`, `MaintenanceKanban`, `ProspectCard`, `BankStatementLinesTable`, `BankLineActions`, `SupplierBillCfdiDropzone`, `LeaderboardPage`, `ActorAvatar`: pasar todos los colores residuales a `success`/`warning`/`destructive`/`info`/`muted`.
   - `FeedbackStatusBadge` y `CalendarStatCards`: usar `hsl(var(--chart-1))`…`--chart-5` vía clases utilitarias (`text-[hsl(var(--chart-2))]`, `bg-[hsl(var(--chart-2)/0.1)]`).
   - `lib/constants.ts`: reemplazar `bg-{red,emerald,blue,teal,purple}-600` por equivalentes semánticos y eliminar `bg-gray-50` aislado.

2. **PageHeader y wrapper**
   - Extender `PageHeader` con prop `backHref?: string` (renderiza `<Link>` + `ArrowLeft`) y `actions?: ReactNode` (alias de `action`, plural).
   - Crear `src/components/layout/PageContainer.tsx` (`<div className="space-y-6">`) opcional `maxWidth: "default" | "form" | "narrow"`.
   - Migrar las ~19 páginas listadas a `PageHeader` + `PageContainer`; eliminar `<h1>` inline y wrappers ad hoc (`p-6 space-y-6 max-w-Xxl`).

3. **Tipografía**
   - Normalizar `PageHeader` a `font-semibold` (hoy `font-bold`) para alinear con sidebar y formularios.
   - Añadir clase utilitaria `.section-label` (small-caps muted) en `index.css` y aplicarla en cards que hoy reescriben el patrón.

4. **Verificación**
   - `rg "(text|bg|border)-(red|amber|yellow|green|blue|emerald|rose|orange|purple|cyan|teal|violet|slate|zinc)-[0-9]"` debe quedar < 10 ocurrencias (sólo paleta `--chart` justificada).
   - `rg "<h1"` debe sólo coincidir con `PageHeader.tsx` y `NotFound.tsx`.
   - Smoke visual a 1920×1080 vía Playwright en Dashboard, AgingReport, Calendar, Maintenance, Feedback.
   - `bun run lint` y `bun run build` limpios.

5. **Changelog**: publicar `v6.98.2` (patch · UI cohesion) describiendo los tres bloques.

## Fuera de alcance

- Cambios de comportamiento o de datos.
- Rediseño de paletas o tipografías (la dirección visual actual se mantiene).
- Mobile/responsive: foco sigue siendo desktop 1080p como pide el usuario.
