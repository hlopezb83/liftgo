

## Review: "Cerrado Ganado" Restriction Coverage

### Current state

The restriction in `CRMPage.tsx` correctly blocks two paths:
1. **Drag-and-drop** to "cerrado_ganado" — blocked with toast
2. **"Agregar" button** on the "cerrado_ganado" column — blocked with toast

### Gaps found

1. **Editing a prospect already in "cerrado_ganado"**: Any user can click a card in that column, opening `ProspectFormDialog` with the "Convertir a Cliente" button visible. A non-admin user could click it and navigate to create a customer from the prospect. The `openEdit` function has no role check.

2. **Changing stage via form save**: When a user drags a prospect, the dialog opens with `overrideStage` set. However, the `onSave` callback in CRMPage does not re-validate the stage before calling `updateProspect.mutate()`. A determined user could potentially manipulate state.

3. **No backend enforcement**: The `prospects` table has no RLS policy or trigger preventing non-admin users from setting `stage = 'cerrado_ganado'`. The restriction is purely frontend. This is acceptable for now but worth noting.

### Plan

**File: `src/pages/CRMPage.tsx`**
- In the `onSave` callback (line 256-263), add a guard: if `data.stage === "cerrado_ganado" && !canCloseDeal`, show toast and return without saving.

**File: `src/components/crm/ProspectFormDialog.tsx`**
- Accept a new optional prop `canCloseDeal?: boolean` (default `true`).
- When `canCloseDeal` is false and `effectiveStage === "cerrado_ganado"`, hide the "Convertir a Cliente" button and show a read-only message instead ("Solo administrativos pueden convertir prospectos a clientes").
- Disable the "Guardar" button when `effectiveStage === "cerrado_ganado"` and `!canCloseDeal` to prevent edits to prospects in that stage from unauthorized users.

**File: `src/pages/CRMPage.tsx`**
- Pass `canCloseDeal={canCloseDeal}` prop to `ProspectFormDialog`.

### Summary of changes
- 3 lines added to `CRMPage.tsx` (onSave guard + prop)
- ~10 lines in `ProspectFormDialog.tsx` (new prop, conditional UI)
- No database changes needed

