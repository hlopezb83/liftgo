# Plan: Remediación R15

Aplicar los 7 hallazgos R15 en un único sprint → **v7.229.0**.

## F-03 · CRÍTICO — Guard de cambios sin guardar dispara tras guardar factura
**Archivo:** `src/features/invoices/components/invoice-form/InvoiceForm.tsx`
- Añadir `const justSavedRef = useRef(false)`.
- Cambiar el guard a: `useUnsavedChangesGuard(f.form.formState.isDirty && !f.isSubmitting && !justSavedRef.current)`.
- En cada `onSuccess` (create y edit), setear `justSavedRef.current = true` **antes** de `form.reset(values)` y `navigate(...)`.
- Ref se lee en el momento del bloqueo → gana la carrera al `navigate` síncrono, sin depender de re-render de RHF.

## F-01 · Cliente requerido sin superficie de error
**Archivo:** `src/features/invoices/lib/invoiceFormSchema.ts`
- Mover el `.min(1, "El cliente es requerido")` de `customerName` a `customerId`.
- `customerName: z.string()` (sin min).
- Ajustar defaults: `customerId: ""` en lugar de `null`.
- Así el `FormMessage` bajo `FormField name="customerId"` (InvoiceForm.tsx:114-125) sí pinta el error.

## F-02 · Error de líneas en `.root` no se renderiza
**Archivo:** `src/features/invoices/components/invoice-form/EditableLineItemsTable.tsx` (línea 18)
- `const rootError = form.formState.errors.lineItems?.root?.message ?? form.formState.errors.lineItems?.message;`
- Usar `rootError` donde antes usaba `.message`.

## R15-AUTH-1 · Alias roto en `get_activity_metrics`
**Migración BD:** restaurar el alias original en el agregado por módulo:
`SELECT entity_type AS "entityType", COUNT(*)::bigint AS total ...`
- Mantiene los guards de roles staff introducidos el 13-jul; solo revierte el rename accidental de columna.
- Reactiva KPI "Módulo más usado", labels y filtro en `/activity`.

## R15-1 · Duplicate React key en preview recurrente
**Archivo:** `src/features/invoices/components/recurring/RecurringPreviewBody.tsx` (línea ~158)
- `key={\`${line.bookingId}:${line.periodStart}\`}` para permitir múltiples períodos catch-up por reserva.

## R15-AUTH-2 · Unhandled promise rejections en diálogos de usuarios
**Archivos:** `InviteUserDialog.tsx`, `DeleteUserDialog.tsx`, y el diálogo de confirm de rol.
- Envolver `await mutateAsync(...)` en `try/catch` (silencioso; el toast ya lo maneja `useEntityMutation`).
- Elimina `pageerror` en consola / Sentry noise.

## R15-AUTH-3 · Ícono de basura abre "Revertir"
**Archivos:** `useAuditTrailColumns.tsx`, `AuditLogMobileCard.tsx`, `DeleteAuditLogDialog.tsx` (donde aplique).
- Reemplazar `DeleteIcon` (bote destructive) por `UndoIcon` (o `History`).
- Quitar clases `text-destructive` en ese trigger; usar `text-muted-foreground hover:text-foreground`.

## Cierre
- `package.json` → v7.229.0.
- Nueva entrada en `public/changelog.json` + `public/changelog/v7.229.0.json` cubriendo los 7 fixes.
- Validación: `tsgo`, `bunx eslint .`, y verificación manual del flujo Guardar Factura (F-03) + `/activity` (AUTH-1).
