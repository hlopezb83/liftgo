

## Plan: Restrict "Cerrado Ganado" to Admin/Administrativo roles

### What changes
Only users with `admin` or `administrativo` roles can move prospects to the "cerrado_ganado" stage. Other roles (ventas, dispatcher, etc.) will be blocked with a toast message.

### Implementation

**File: `src/pages/CRMPage.tsx`**
1. Import `useUserRole` hook
2. In `onDragEnd`: when `newStage === "cerrado_ganado"`, check if the user's role is `admin` or `administrativo`. If not, show a toast error ("Solo usuarios administrativos pueden mover prospectos a Cerrado Ganado") and `return` without opening the dialog.
3. In `openCreate`: apply the same check when `stage === "cerrado_ganado"` to prevent creating prospects directly in that column.

**File: `src/components/crm/ProspectFormDialog.tsx`**
4. No changes needed — the restriction is enforced at the CRM page level before the dialog opens.

### Technical details
- Uses the existing `useUserRole()` hook which returns the user's highest-priority role
- Check: `role === "admin" || role === "administrativo"`
- Approximately 10 lines of new code in `CRMPage.tsx`

