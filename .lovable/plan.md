
# Snappier Forklift Delete

## What changes
Make the delete action feel instant by navigating away immediately after the user confirms, rather than waiting for the database operations to complete.

## Approach
Two small tweaks -- no new files needed:

### 1. Optimistic navigation (`ForkliftDetail.tsx`)
- Navigate to `/fleet` and show the success toast **before** the mutation resolves, right when the user clicks "Delete" in the confirmation dialog.
- Use `mutateAsync` wrapped in a try/catch so errors still surface, but the happy path feels instant.

### 2. Optimistic cache removal (`useForkliftData.ts`)
- Add an `onMutate` callback to `useDeleteForklift` that immediately removes the deleted forklift from the cached `forklifts` list (so the fleet table never briefly shows the deleted row).
- Store the previous cache for rollback in `onError`.

### Technical detail

**`src/hooks/useForkliftData.ts`** -- add optimistic update to `useDeleteForklift`:
- `onMutate`: cancel outgoing queries, snapshot cache, remove item from `["forklifts"]` query data.
- `onError`: restore snapshot.
- Keep existing `onSuccess` invalidation for consistency.

**`src/pages/ForkliftDetail.tsx`** -- change `handleDelete`:
- Immediately call `navigate("/fleet")` and `toast.success(...)`.
- Fire `deleteForklift.mutate(...)` in the background (fire-and-forget with an `onError` fallback toast).
