## Objetivo

Migrar los 17 `AlertDialog` de confirmación a la primitiva `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) para cerrar el lenguaje unificado de modales.

## Mejoras a la primitiva `ConfirmDialog`

Extender el componente actual para cubrir todos los casos de uso encontrados sin perder accesibilidad:

- `loading?: boolean` → deshabilita el botón confirmar y muestra spinner (`Loader2`), cubre los `isPending` de mutaciones (RoleChange, DeleteUser, DeleteProspect, DeletePart, DeleteMaintenance, etc.).
- `descriptionNode?: ReactNode` → permite descripción con JSX rico (caso `CustomerDeleteDialog` que lista relaciones con `<ul>`).
- Mantener `destructive` para los confirmar peligrosos.
- Mantener API controlada (`open` / `onOpenChange`) — los pocos casos con `AlertDialogTrigger` (BookingActions, ProspectActions, QuoteDetailActions, PartDetailSheet, ForkliftDetail, MaintenanceDetailSheet) se reescriben a estado controlado con `useState` o `useDialogState`.

## Archivos a migrar (17)

| Módulo | Archivo | Tipo |
|---|---|---|
| CRM | `CRMClosedPage.tsx` | Reabrir deal (default) |
| CRM | `ProspectActions.tsx` | Eliminar prospecto (destructive + loading) |
| Customers | `CustomerDeleteDialog.tsx` | Eliminar cliente (destructive + descriptionNode) |
| Bookings | `BookingActions.tsx` | Confirmar acción genérica (destructive) |
| Users | `RoleChangeDialog.tsx` | Cambiar rol (default + loading) |
| Users | `DeleteUserDialog.tsx` | Eliminar usuario (destructive + loading) |
| Quotes | `QuoteDetailActions.tsx` | Eliminar cotización (destructive) |
| Inventory | `PartDetailSheet.tsx` | Eliminar refacción (destructive + loading) |
| Fleet | `ForkliftDetail.tsx` | Eliminar montacargas (destructive) |
| Maintenance | `MaintenanceDetailSheet.tsx` | Eliminar registro (destructive + loading) |
| Operations | `MechanicsTab.tsx` | Eliminar mecánico (destructive) |
| Operations | `MaintenancePoliciesTab.tsx` | Eliminar política (destructive) |
| Operations | `EquipmentModelsTab.tsx` | Eliminar modelo (destructive) |
| Operations | `DriversTab.tsx` | Eliminar operador (destructive) |
| AP | `CancelSupplierBillDialog.tsx` | Cancelar factura (destructive) |
| Invoices | `InvoiceDetailDialogs.tsx` | Confirmaciones de factura (default/destructive) |
| Deliveries | `DeliveryActions.tsx` | Confirmar acción (destructive) |

## Patrón de reemplazo

Antes:
```tsx
<AlertDialog open={open} onOpenChange={setOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>…</AlertDialogTitle>
      <AlertDialogDescription>…</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={…} disabled={mut.isPending}>Eliminar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Después:
```tsx
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="…"
  description="…"
  confirmLabel="Eliminar"
  destructive
  loading={mut.isPending}
  onConfirm={…}
/>
```

## Validación

- `bun run lint` debe seguir en 0 errores.
- `tsgo` (typecheck) sin nuevos errores.
- Revisión visual de los flujos con sesión Playwright en 2-3 casos representativos (eliminar prospecto, cambiar rol, cancelar factura) si el usuario lo pide.

## Changelog

Nueva entrada **v6.88.0** (minor) en `public/changelog.json` + `public/changelog/v6.88.0.json` documentando la migración de 17 confirmaciones a `ConfirmDialog` y la extensión de la primitiva con `loading` / `descriptionNode`.

## Memoria

Actualizar `mem://design/form-dialogs` para incluir `ConfirmDialog` como primitiva oficial para confirmaciones (default / destructive, con `loading` y `descriptionNode`).
