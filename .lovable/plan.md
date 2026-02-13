

# Refactor: Extract Shared Patterns into Reusable Components

## Problem
Several UI patterns are duplicated across pages: page headers, date pickers, table loading skeletons, empty table states, and form action buttons. Extracting these into shared components will reduce total lines of code significantly and improve consistency.

## Changes

### 1. New shared component: `DatePickerField`
The calendar-popover date picker pattern is repeated 4 times (BookingForm x2, MaintenancePage x2). Extract into a single reusable component.

**File:** `src/components/DatePickerField.tsx`

### 2. New shared component: `PageHeader`
Every page renders the same header block: title, subtitle, and optional action button. Extract into one component.

**File:** `src/components/PageHeader.tsx`

### 3. New shared component: `TableSkeleton`
The loading skeleton pattern (3 rows of `Skeleton` inside a card) is used in Fleet, CustomersPage, and MaintenancePage. Consolidate.

**File:** `src/components/TableSkeleton.tsx`

### 4. New shared component: `EmptyRow`
The "No X found" empty table row is repeated in Fleet, CustomersPage, MaintenancePage. Extract.

**File:** `src/components/EmptyRow.tsx`

### 5. New shared component: `FormActions`
Submit + Cancel button pair is in ForkliftForm, BookingForm, CustomersPage, MaintenancePage.

**File:** `src/components/FormActions.tsx`

### 6. Refactor all pages to use new components
- **Dashboard.tsx** -- use PageHeader
- **Fleet.tsx** -- use PageHeader, TableSkeleton, EmptyRow
- **ForkliftForm.tsx** -- use FormActions
- **ForkliftDetail.tsx** -- no major changes (already concise)
- **CalendarPage.tsx** -- use PageHeader
- **BookingForm.tsx** -- use DatePickerField, FormActions
- **CustomersPage.tsx** -- use PageHeader, TableSkeleton, EmptyRow, FormActions
- **MaintenancePage.tsx** -- use PageHeader, TableSkeleton, EmptyRow, DatePickerField, FormActions

### Estimated reduction
Roughly 80-100 lines removed across pages by extracting ~60 lines of shared components. Net reduction of ~30-40 lines plus much better consistency and maintainability.

---

## Technical Details

### DatePickerField props
```typescript
{ label: string; date?: Date; onSelect: (d?: Date) => void; placeholder?: string; required?: boolean }
```

### PageHeader props
```typescript
{ title: string; subtitle?: string; action?: ReactNode }
```

### TableSkeleton props
```typescript
{ rows?: number }  // defaults to 3
```

### EmptyRow props
```typescript
{ colSpan: number; message?: string }
```

### FormActions props
```typescript
{ submitLabel: string; isPending: boolean; onCancel: () => void }
```

