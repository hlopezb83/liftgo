# Plan: Auditoría del Sidebar — Tableta y Móvil

Hallazgos verificados con Playwright a 900×1000 (tableta) y 390×800 (móvil) en `/calendar`.

## Cambios

### 1. Sidebar en tableta: usar offcanvas (Sheet) igual que móvil
- Hoy `useIsMobile` (<768) decide entre Sheet vs sidebar fijo. En tableta (768–1023) el sidebar fijo de 256 px come ~28% del ancho y no hay mini-rail.
- Cambiar `SidebarProvider` para tratar `useIsTabletOrBelow` (<1024) como "mobile mode" → Sheet en tableta y móvil, sidebar fijo sólo en ≥1024 px.
- Archivo: `src/components/ui/sidebar/SidebarProvider.tsx` (o donde viva la lógica isMobile del componente shadcn).

### 2. Footer del usuario tapa los últimos items del menú
- `SidebarUserFooter` es sticky/absolute y overlay sobre `SidebarContent`.
- Ajustar layout del `Sidebar` root a flex-column con `SidebarContent` en `flex-1 min-h-0 overflow-y-auto` y footer como hermano no-absoluto. Esto también arregla el hallazgo 5 (scroll del Sheet en móvil).
- Archivos: `src/components/ui/sidebar/Sidebar.tsx`, `src/layouts/AppSidebar.tsx`.

### 3. Tooltip "Tema oscuro" abierto al montar el Sheet en móvil
- Radix Tooltip se abre por focus. Al abrir el Sheet, el primer control enfocable recibe focus y dispara el tooltip.
- Solución: en `ThemeToggle` (y hermanos del footer) pasar `delayDuration` y/o envolver con Tooltip que **no** abra por focus en touch — la vía canónica es setear `disableHoverableContent` en el provider o quitar Tooltip en los tres botones del footer cuando `useIsTabletOrBelow` es true (labels visibles no aportan sobre iconos ya con `aria-label`).
- Archivos: `src/layouts/sidebar/ThemeToggle.tsx`, `src/layouts/sidebar/SidebarUserFooter.tsx`.

### 4. Email del usuario se corta detrás de los botones en móvil
- Reestructurar `SidebarUserFooter` a dos filas en anchos angostos: fila 1 email + rol, fila 2 acciones (theme / password / logout).
- Usar `flex-col gap-2` con `min-w-0` y `truncate` en el email.
- Archivo: `src/layouts/sidebar/SidebarUserFooter.tsx`.

### 5. `SidebarContent` no hace scroll dentro del Sheet
- Se resuelve con el fix del hallazgo 2 (flex-column + `flex-1 min-h-0 overflow-y-auto` en `SidebarContent`).
- Sanity check: el `SheetContent` del sidebar mobile debe tener `flex flex-col h-full p-0` sin `overflow` propio para que el scroll viva en el hijo.

### 6. Falta botón "cerrar" visible dentro del Sheet
- Agregar un `SidebarTrigger` (o botón X con icono) en el header interno del Sheet, en la esquina superior derecha del `SidebarBranding`, visible sólo cuando `useIsTabletOrBelow`.
- Archivo: `src/layouts/sidebar/SidebarBranding.tsx` (recibe prop opcional `onClose` y muestra botón si se pasa).

## Verificación
- Playwright a 390×800 y 900×1000 en `/calendar`, `/`, `/invoices`:
  - Sheet abre y cierra con trigger interno.
  - Scroll llega hasta grupo "Sistema".
  - Footer no oculta items.
  - Sin tooltip pegado al montar.
  - Email visible completo (o truncado con ellipsis, no tapado).
- `bun run test` para regresiones de unit tests del sidebar / permisos.
- Screenshot diff manual antes/después.

## Changelog
- Nueva entrada `public/changelog/v7.86.0.json` (minor: UX del sidebar en tableta y móvil) + índice `public/changelog.json`.

## Fuera de alcance
- Rediseño del sidebar en escritorio (≥1024 px queda idéntico).
- Reordenar grupos del menú (`navConfig.ts` sin cambios).
- Cambios en permisos o `useVisibleNavGroups`.
