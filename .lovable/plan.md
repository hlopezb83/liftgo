# Revisión Ola 2.6 y siguiente fase

## Estado Ola 2.6 (v7.122.0) — verde

- BL-M1: RLS `dispatcher` a `SELECT` + `payments.created_by` con FK. ✅
- EC-M2: `useCustomer(id)` con PK + `.limit(LIST_PAGE_LIMIT)` y warn. ✅
- EC-M3: `useBookingsRange` con `.limit(2000)` y warn. ✅
- EC-M5: RPC `assert_not_last_admin` (FOR UPDATE) + reorden de `delete-user` (auth primero). ✅
- Tests: 1091/1091 Vitest, Deno estable. Sin regresiones detectadas.

Nada pendiente de la Ola 2.6.

---

# Sprint 3 · Ola 3.1 — UX operativa (UX-A1..A4)

Del roadmap del auditor, Sprint 3 arranca con los cuatro hallazgos UX-Altos. Los abordo juntos porque comparten componentes de layout y patrones de confirmación.

## Alcance

### UX-A1 · Estado de error en listados
Hoy si una query falla, `ListPageLayout` muestra "No se encontraron registros" y esconde el error real.

- Extender `ListPageLayout` con `isError?: boolean` y `onRetry?: () => void`.
- Nuevo componente `src/components/feedback/ErrorState.tsx` (mismo lenguaje visual que `EmptyState`, con `Icon name="alert"` y botón "Reintentar").
- Cuando `isError` es true → renderizar `ErrorState` en vez de `EmptyState`.
- Propagar `isError`/`refetch` en las 4 páginas prioritarias:
  `InvoicesPage`, `FleetPage`, `CustomersPage`, `BookingsPage`.
- Test: `ErrorState.test.tsx` (render + click reintento dispara callback).

### UX-A2 · Paginación móvil en Clientes
`CustomersPage.tsx` usa `customContent` para mobile y pierde `DataTablePaginationV2`.

- Migrar a `mobileCardRender` (patrón del resto de las 14 páginas) para que la paginación cliente-side de 25 aplique en móvil.
- Verificar visualmente con Playwright a 375×812 que aparecen los controles y navegan páginas.

### UX-A3 · Confirmación en borrados destructivos
Dos puntos identificados:

- `MaintenanceLaborSection.tsx` (mano de obra con costo, líneas 59-61 y 117-120).
- `DocumentAttachments.tsx` (pólizas/verificaciones, líneas 28-30 y 62-64).

Envolver el handler de borrado con `useConfirm({ destructive: true, title, description })` siguiendo el copy del resto de la app ("¿Eliminar…?" / "Esta acción no se puede deshacer").

### UX-A4 · Guarda de cambios sin guardar
Nuevo hook reutilizable `src/hooks/useUnsavedChangesGuard.ts`:

- Recibe `isDirty: boolean` de RHF.
- Registra `beforeunload` (mensaje del navegador) y `useBlocker` de React Router (mensaje custom con `useConfirm`).
- Aplicarlo en `ContractForm`, `QuoteForm`, `InvoiceForm`.
- Test unitario del hook con `renderHook` (setea/limpia listeners, respeta `!isDirty`).

## Fuera de alcance (para próxima ola)

- UX-M1 (RHF+zod en Contract/QuoteForm) — es un refactor más grande y se irá en Ola 3.2 junto con EC-A4/EC-M1 y confirmaciones móviles (Sprint 3 restante del roadmap del auditor).

## Cambios técnicos

- **Archivos nuevos**: `src/components/feedback/ErrorState.tsx`, `src/hooks/useUnsavedChangesGuard.ts`, `src/components/feedback/__tests__/ErrorState.test.tsx`, `src/hooks/__tests__/useUnsavedChangesGuard.test.ts`.
- **Archivos modificados**: `ListPageLayout`, 4 páginas de listado, `MaintenanceLaborSection`, `DocumentAttachments`, `ContractForm`, `QuoteForm`, `InvoiceForm`, `CustomersPage`.
- **DB / Edge**: sin cambios.
- **Changelog**: `public/changelog.json` → v7.123.0 (`minor`) + `public/changelog/v7.123.0.json` con secciones por hallazgo.

## Verificación

1. `bunx vitest run` (esperado: 1091 + 2 nuevos = 1093 verde).
2. `tsgo --noEmit`.
3. Playwright headless: viewport 375×812 sobre `/customers` verificando paginación; viewport 1280×1800 sobre `/invoices` forzando error de red y capturando el `ErrorState`.
