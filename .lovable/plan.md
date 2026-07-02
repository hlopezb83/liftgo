## Problema

Al eliminar una factura desde `/invoices/:id`, aparece un toast de error:
`Cannot coerce the result to a single JSON object (PGRST116) · The result contains 0 rows` justo después del toast "Factura eliminada".

## Causa raíz

`useDeleteInvoice.onSuccess` hace `invalidateQueries({ queryKey: invoiceKeys.all })`. Esto invalida **todas** las queries del árbol `invoices`, incluida `invoiceKeys.detail(id)` que sigue montada durante el ciclo de navegación de regreso a `/invoices`. `useInvoice(id)` refetchea con `.single()` sobre una fila que ya no existe → PGRST116 → el handler global de `QueryCache` en `AppProviders` dispara el toast.

Este patrón es idéntico al que motivó la memoria `single-query-errors`: usar `.single()` en lecturas donde la ausencia de fila es un estado válido.

## Cambios

### 1. `src/features/invoices/hooks/invoices/useInvoices.ts`
- `useInvoice`: cambiar `.single()` por `.maybeSingle()` y devolver `data` (puede ser `null`). Esto elimina PGRST116 para cualquier detalle que quede huérfano (borrado desde otra pestaña, RLS, id inválido en URL, etc.).
- Marcar la query con `meta: { silent: true }` para que un fallo puntual del detalle no dispare el toast global; el componente ya maneja el caso `!invoice` con "Factura no encontrada".

### 2. `useDeleteInvoice` (mismo archivo)
- Antes de invalidar, remover la query de detalle específica del cache: `queryClient.removeQueries({ queryKey: invoiceKeys.detail(id), exact: true })` para que no se refetchee.
- Mantener el `invalidateQueries` sobre `invoiceKeys.lists()` (más acotado que `all`) para refrescar la lista sin tocar detalles de otras facturas.

### 3. `src/features/invoices/pages/InvoiceDetail.tsx`
- Ajustar la guarda: si `!isLoading && !invoice`, seguir mostrando "Factura no encontrada" (ya lo hace) — no requiere cambio funcional, sólo confirmar que sigue funcionando con `maybeSingle` que devuelve `null`.

### 4. Test
- Añadir caso en `useInvoices.rls.test.ts` (o nuevo archivo) que verifique: `useInvoice("id-inexistente")` con respuesta `{ data: null, error: null }` resuelve a `data: null` sin lanzar error.

### 5. Changelog
- `public/changelog/v6.104.7.json` (patch) + entrada en `public/changelog.json`:
  > Corrige toast de error PGRST116 al eliminar una factura desde su vista de detalle. `useInvoice` ahora tolera fila ausente y el delete limpia el cache del detalle antes de invalidar la lista.

## Fuera de alcance

- Auditar otros `.single()` del feature (`fetchInvoicePdfData`, `syncInvoiceStatus`, `backfillStampSnapshot`, `usePayments`, `useCollectionNotes`, `useCreditNoteMutations`): son escrituras o lecturas que garantizan existencia. Se dejan igual salvo que aparezca un reporte similar.
