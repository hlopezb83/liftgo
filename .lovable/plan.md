## Auditoría UI/UX — Segunda pasada (post v6.98.7)

Tras la armonización inicial, todavía quedan **3 focos** que rompen la cohesión visual entre páginas de lista y páginas de detalle/secundarias. Todo lo demás (paleta, tokens, gaps, anchos de formulario, dialogs) ya está alineado.

## Hallazgos

### 1. `DetailPageHeader` usa tipografía distinta a `PageHeader`

`PageHeader` (listas) → `text-xl sm:text-2xl font-semibold tracking-tight`
`DetailPageHeader` (detalles) → `text-xl sm:text-2xl font-bold` (sin `tracking-tight`)

Impacto: cada vista de detalle (Invoice, Customer, Supplier, Forklift, Booking, Contract, Quote, Delivery, Return, Payment Intent, Maintenance, Damage, etc. — ~15 páginas) renderiza el título más grueso que su listado padre. En 1080p es la inconsistencia más visible al navegar listado → detalle.

**Fix:** en `src/components/layout/DetailPageHeader.tsx` línea 37, cambiar `font-bold` → `font-semibold tracking-tight`. Cero cambios de API.

### 2. `HelpPageHeader` duplica un h1 manual

`src/features/help/components/HelpPageHeader.tsx` arma su propio `<h1 class="text-2xl font-bold tracking-tight">` con ícono dentro. Rompe con el resto del ERP que ya migró a `PageHeader`.

**Fix:** refactor a `PageHeader` con `actions` (Select de versiones + botón Generar) y el ícono integrado en `title` opcionalmente como elemento aparte arriba (o simplemente quitar el ícono). Manteniendo todos los props actuales del componente.

### 3. `CRMToolbar` también renderiza un h1 manual

`src/features/crm/components/CRMToolbar.tsx` línea 35: `<h1 class="text-2xl font-bold tracking-tight">Pipeline CRM</h1>` con su propia barra de acciones. Es la única página principal que evita `PageHeader`.

**Fix:** reemplazar el bloque `flex items-center justify-between` (líneas 33–65) por `<PageHeader title="Pipeline CRM" subtitle={...} actions={<>...</>} />`. La toolbar de filtros (línea 67 en adelante) se queda intacta.

## Lo que NO se cambia

- **Números en KPIs (`text-2xl font-bold font-mono` en StatCards, FinancialKpiCards, AgingReport, etc.):** intencional. `font-bold` da peso visual a cifras tabulares; el sistema usa `font-semibold` solo para títulos/encabezados, no para datos numéricos. Mantener.
- **`SupplierBillFormDialog` con `max-w-2xl`:** ese es el tamaño correcto del dialog para formularios densos; el token `form` (`max-w-3xl`) aplica a páginas, no a dialogs.
- **`AuditLogDetailDialog` `sm:max-w-2xl`:** mismo criterio, sigue las variantes de shadcn Dialog.
- **Tokens, colores, paleta, dark mode:** ya 100% semánticos.

## Plan

1. `DetailPageHeader.tsx`: `font-bold` → `font-semibold tracking-tight`.
2. `HelpPageHeader.tsx`: refactor para envolver con `PageHeader` (mantener Select de versiones + botón Generar como `actions`).
3. `CRMToolbar.tsx`: reemplazar h1 manual por `PageHeader` (mantener filtros y KPIs debajo).
4. Agregar entrada `v6.98.8` al changelog (patch — armonización de headers de detalle y páginas secundarias).
5. Sin cambios de tests, RPCs ni lógica.

## Riesgo

Mínimo. Solo cambios tipográficos y de wrapper. Cero impacto en queries, navegación o estado.
