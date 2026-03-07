

## Plan: Kanban Board for Maintenance

### Overview
Add a drag-and-drop Kanban board view to MaintenancePage with 4 columns: Pendiente, En Progreso, Esperando Refacciones, Completado. Requires a new `work_status` column on `maintenance_logs` and the `@hello-pangea/dnd` library.

### Database Change
Add `work_status` text column (default `'pending'`) to `maintenance_logs`:
```sql
ALTER TABLE public.maintenance_logs ADD COLUMN work_status text NOT NULL DEFAULT 'pending';
```

### Files to Change

1. **Migration** — add `work_status` column
2. **`src/lib/constants.ts`** — add `MAINTENANCE_WORK_STATUSES` array and labels in `STATUS_LABELS`
3. **`src/hooks/useMaintenanceLogs.ts`** — add `useUpdateMaintenanceLog` mutation for updating `work_status`
4. **Create `src/components/maintenance/MaintenanceKanban.tsx`** — Kanban board using `@hello-pangea/dnd` with 4 columns, each showing cards with forklift name, service type, date, cost, and mechanic. `onDragEnd` calls the update mutation.
5. **`src/pages/MaintenancePage.tsx`** — add `ToggleGroup` for "Lista" / "Tablero" view toggle. When "Tablero" is selected, render `MaintenanceKanban` instead of the table.
6. **`src/lib/changelog.ts`** — add v3.10.0 entry

### New Dependency
- `@hello-pangea/dnd` — React drag-and-drop library (maintained fork of react-beautiful-dnd)

### Kanban Column Mapping
| Column | `work_status` value | Color |
|--------|-------------------|-------|
| Pendiente | `pending` | amber |
| En Progreso | `in_progress` | blue |
| Esperando Refacciones | `waiting_parts` | orange |
| Completado | `completed` | green |

### Key Behavior
- Dragging a card between columns calls `supabase.from("maintenance_logs").update({ work_status }).eq("id", logId)`
- Optimistic update via queryClient for instant feedback
- Existing logs default to `'pending'` status
- Board respects the same search/forklift filters as the table view

