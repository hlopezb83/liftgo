## Problema

En el detalle de FAC-0076 (timbrada y en proceso de cancelación) aparecen los botones **Editar** y **Eliminar**, que no deberían existir sobre una factura ya timbrada — una vez que el CFDI existe ante el SAT, la factura es inmutable y sólo puede cancelarse.

## Causa

En `src/features/invoices/components/invoice-detail/InvoiceDetailActions.tsx`:

- `canEdit = isDraft || userRole === "admin"` → permite editar aun timbrada/cancelada si el usuario es admin.
- El botón **Eliminar** está envuelto sólo por `RoleGuard` (acceso a "Facturas"), sin considerar el estatus fiscal. Por eso se muestra sobre facturas timbradas y canceladas.

## Cambios

Archivo único: `src/features/invoices/components/invoice-detail/InvoiceDetailActions.tsx`

1. **Editar** — restringir estrictamente a borradores:
   - `canEdit: isDraft` (quitar el bypass de admin).
2. **Eliminar** — sólo permitir sobre borradores:
   - Añadir flag `canDelete: isDraft` en `computeFlags`.
   - Envolver el botón Eliminar en `{flags.canDelete && (<RoleGuard …>…</RoleGuard>)}` para que desaparezca en cuanto la factura pase a `sent`, `stamped`, `partial`, `paid`, `cancelled`, etc.

## Notas de negocio

- Una factura timbrada no se elimina; se cancela vía CFDI (botón "Cancelar CFDI" ya existente).
- Los borradores sí pueden borrarse porque nunca fueron enviados al SAT.
- No se toca la lógica del hook `useDeleteInvoice` ni RLS; la restricción es de UI (la RPC de borrado ya valida en backend).

## Changelog

Agregar entrada `patch` v6.104.8 en `public/changelog.json` + `public/changelog/v6.104.8.json` describiendo el fix.
