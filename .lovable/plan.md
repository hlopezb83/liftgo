# Auditoría UI/UX — Cohesión visual @ 1920×1080

Tras revisar `PageContainer`, `PageHeader`, `FormPageHeader`, `DetailPageHeader` y ~40 páginas de `src/features`, detecto que el 90% del sistema ya está unificado (v6.98.x), pero quedan **5 focos concretos** que rompen la sensación de "una sola app". Propongo corregirlos en un solo pase, sin tocar lógica de negocio.

## Hallazgos y fix por foco

### 1. Dos tipografías distintas para el título de página

`PageHeader` usa `text-xl sm:text-2xl font-semibold tracking-tight` (estándar).
`FormPageHeader` usa `text-2xl font-bold` sin `tracking` ni `truncate`. Resultado: los formularios (Quote, Invoice, Forklift, Booking) se ven "más gordos" que el resto del ERP.

**Fix:** reescribir `FormPageHeader.tsx` para que renderice internamente `<PageHeader title={title} backHref="…"/>` reusando el botón "Volver" estándar, eliminando la variante `font-bold`. Mantener la API (`title`, `onBack`) por compatibilidad.

### 2. Páginas de detalle sin `PageContainer`

`ReturnInspectionDetail.tsx` y `BookingDetail.tsx` aún devuelven `<div className="space-y-6">` directo (sin `p-4 sm:p-6` ni `max-w-*`). En 1080p el contenido pega contra el sidebar y no respeta el `maxWidth="wide"` del resto de detalles (Customer, Supplier, Forklift, Invoice).

**Fix:** envolver ambos `return` en `<PageContainer maxWidth="wide">`, incluido el estado `isLoading`/`not found`.

### 3. Inconsistencia de `gap` en grids de tarjetas

Estándar dominante para grids de detalle = `gap-6`. Estándar para filas de KPIs/StatCards = `gap-4`. Pero hay mezclas:
- `PortalDashboard`: stat cards con `gap-6` (debería ser `gap-4` como Dashboard interno).
- `ReturnInspectionDetail` y `BookingDetail`: ya en `gap-6` ✓.
- `Dashboard` skeleton: `gap-4` ✓.

**Fix:** cambiar `gap-6` → `gap-4` en los dos `grid` de `PortalDashboard.tsx` (stat cards). Documentar la regla en `mem://arch/ui/component-library`: **KPI rows = gap-4, detail grids = gap-6**.

### 4. `CardContent` con padding manual `p-6` rompe densidad

`ChangelogPage.tsx` usa `<CardContent className="p-6 …">` en dos lugares para empty/zero states; el `Card` shadcn ya aporta `p-6` por defecto. Genera doble padding visible en 1080p.

**Fix:** quitar `p-6` redundante en `ChangelogPage.tsx` líneas 53 y 90 (dejar solo `text-center space-y-2` y `text-center text-muted-foreground`).

### 5. Anchos de formularios "sueltos" (`max-w-2xl`)

`CompanyLogoTab.tsx` y `FiscalDataTab.tsx` usan `max-w-2xl` hardcodeado. El resto del ERP ya migró a `PageContainer maxWidth="form"` (= `max-w-3xl`). Resultado: dentro de Configuración hay dos anchos de formulario distintos.

**Fix:** quitar `max-w-2xl` de ambos `<form>` y dejar que el contenedor padre (`PageContainer maxWidth="form"` en `SettingsPage`) controle el ancho. Si la página padre aún no lo aplica, envolver el contenido con `<div className="max-w-3xl">` para alinear con el token `form`.

## Tipografía y color — sin cambios

La escala (`text-xs/sm/base`, `font-semibold` para títulos, `text-muted-foreground` para subtítulos) y los tokens semánticos (`bg-warning/10 text-warning`, `text-success`, `text-destructive`) son consistentes a lo largo de tablas, sheets y kanban. No hay colores hardcodeados (`bg-[#…]`) ni `text-white/text-black` fuera de los wrappers permitidos.

## Componentes — sin cambios

`Card`, `Dialog`, `Sheet`, `Button`, `Badge`, `StatusBadge` se usan vía shadcn variants. Los `max-w-md/lg/xl` dentro de `DialogContent`/`SheetContent` corresponden al sistema (`sm:max-w-md` para confirms, `sm:max-w-lg` para forms simples, `sm:max-w-xl` para sheets de detalle) — coherente.

## Plan de cambio

1. Reescribir `src/components/layout/FormPageHeader.tsx` para delegar en `PageHeader`.
2. Envolver `ReturnInspectionDetail.tsx` y `BookingDetail.tsx` con `PageContainer maxWidth="wide"` (incluye loading/empty).
3. Cambiar `gap-6` → `gap-4` en los dos grids de KPI de `PortalDashboard.tsx`.
4. Eliminar `p-6` redundante de `ChangelogPage.tsx` (2 ocurrencias).
5. Quitar `max-w-2xl` de `CompanyLogoTab.tsx` y `FiscalDataTab.tsx`, asegurar `maxWidth="form"` en la página padre de Configuración.
6. Actualizar memoria `mem://arch/ui/component-library` con la regla **gap-4 KPI / gap-6 detail**.
7. Agregar entrada al changelog como `v6.98.7` (patch — armonización visual, sin lógica).

## Riesgo

Mínimo. Solo cambios de wrappers y tokens; sin tocar queries, RPCs, formularios ni navegación.
