

## Plan: E-Signature for Delivery Completion

### Overview
Add a signature pad component and integrate it into the delivery completion flow. When marking a delivery as complete, a signature capture dialog will appear. The signature is saved as base64 to a new `signature_base64` column on the `deliveries` table.

### Database Change
Add a `signature_base64` text column to the `deliveries` table (nullable, no default). This stores the PNG data URL.

```sql
ALTER TABLE public.deliveries ADD COLUMN signature_base64 text;
```

### New Component: `src/components/SignaturePad.tsx`
- Uses an HTML `<canvas>` element with pointer events for drawing (no external library needed -- avoids adding `react-signature-canvas` dependency since a lightweight canvas implementation is simpler and avoids compatibility issues).
- Props: `onSave(base64: string)`, `onClear()`, optional `width`/`height`.
- Features: freehand drawing via pointer events, Clear button (erases canvas), Undo button (restores last snapshot from a history stack).
- Renders a bordered canvas with a dotted signature line, buttons below.
- `onSave` returns `canvas.toDataURL("image/png")`.

### Integration: Delivery Completion Flow
Currently `markComplete` in `DeliveriesPage.tsx` directly calls `updateDelivery.mutate`. Change this to:

1. When user clicks "Completar", open a new **signature dialog** instead of immediately completing.
2. The dialog shows the `SignaturePad` component with title "Firma del Cliente" and a "Confirmar Entrega" button.
3. On confirm, call `updateDelivery.mutate` with `{ id, status: "completed", completed_at: ..., signature_base64: <base64> }`.
4. Allow skipping signature (optional) with an "Omitir Firma" link.

### Files to Create/Edit
1. **Create** `src/components/SignaturePad.tsx` -- reusable canvas-based signature pad
2. **Edit** `src/pages/DeliveriesPage.tsx` -- add signature dialog state, show dialog on complete, pass signature to update mutation
3. **Migration** -- add `signature_base64` column to `deliveries`

### Technical Details
- Canvas drawing uses `pointerdown`/`pointermove`/`pointerup` events for cross-device support (mouse + touch).
- Undo stores canvas `ImageData` snapshots on each stroke start.
- The `signature_base64` field will be a data URL string (~10-50KB typical for a signature PNG). Supabase text columns handle this fine.
- The `useUpdateDelivery` hook already accepts arbitrary update fields via `TablesUpdate<"deliveries">`, so no hook changes needed once the column exists.

