# Mostrar folio próximo en Nueva Factura

## Objetivo
Cuando el usuario entra a `/invoices/new`, mostrar de forma visible cuál será el folio que se asignará al guardar (por ejemplo, "Folio: FAC-0057").

## Cambios

### 1. Hook nuevo: `src/hooks/useNextInvoiceNumber.ts`
- Query con `useQuery(["invoices", "next-number"])`.
- Llama a `supabase.rpc("next_invoice_number")` (la misma RPC que usa `useCreateInvoice`).
- `staleTime: 0` y se invalida tras crear/eliminar facturas para mantenerse actualizado.
- Solo se ejecuta cuando se necesita (modo creación).

### 2. UI en `src/pages/InvoiceForm.tsx`
- En modo creación (`!form.isEdit`), agregar dentro de la card "Detalles de Factura" una fila destacada:
  - Etiqueta: "Folio próximo"
  - Valor: `FAC-XXXX` con estilo `font-semibold text-primary`, o "Calculando…" mientras carga.
- Usar el componente existente `InfoRow` para mantener consistencia visual.
- Nota auxiliar pequeña: "El folio se asigna al guardar; puede cambiar si otra factura se emite antes."

### 3. Invalidación
- En `useCreateInvoice` y `useDeleteInvoice` (en `src/hooks/useInvoices.ts`), invalidar también `["invoices", "next-number"]` en `onSuccess` para refrescar el preview tras una emisión.

### 4. Changelog
- `public/changelog/v5.59.7.json` (patch) + entrada en `public/changelog.json`:
  - Título: "Vista previa de folio en nueva factura"
  - Descripción: muestra el próximo `FAC-XXXX` antes de guardar.

## Notas técnicas
- La RPC `next_invoice_number` ya respeta `min_next_number` (introducido en v5.59.3), por lo que el preview reflejará correctamente saltos de folio configurados.
- No se hace ninguna escritura adicional en BD; es solo una consulta de previsualización.
