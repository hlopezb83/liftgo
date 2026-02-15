

# Add Uniqueness Locks on Forklift Name and Serial Number

## What Changes

Two uniqueness constraints will be added to prevent duplicate forklift entries:

1. **Database-level**: Add unique constraints on the `forklifts.name` and `forklifts.serial_number` columns so duplicates are rejected at the database level
2. **Form-level**: Add a client-side duplicate check in `ForkliftForm.tsx` that warns the user before they submit, providing a better experience than a raw database error

---

## Technical Details

### Database Migration

Add two unique indexes:

```sql
CREATE UNIQUE INDEX forklifts_name_unique ON forklifts (name);
CREATE UNIQUE INDEX forklifts_serial_number_unique ON forklifts (serial_number) WHERE serial_number IS NOT NULL;
```

The serial number index uses a partial index (`WHERE serial_number IS NOT NULL`) so that multiple forklifts can have no serial number, but once one is entered it must be unique.

### ForkliftForm.tsx

- Import `useForklifts` to get all existing forklifts
- Before submit, check if another forklift already has the same `name` or `serial_number` (excluding the current forklift when editing)
- Show a toast error like "A forklift with this name already exists" if a duplicate is detected
- Also improve the `onError` handler in the mutation to catch the database constraint error and show a friendly message (as a fallback for race conditions)

### Files to modify
- **Database migration**: Add unique constraints on `forklifts.name` and `forklifts.serial_number`
- **Edit**: `src/pages/ForkliftForm.tsx` -- add client-side duplicate check
