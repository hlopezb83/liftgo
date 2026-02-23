
# Desktop Optimization and Structural Improvements

Since the app is used 99% on desktop, this plan focuses on making the desktop experience faster, more polished, and easier to use.

## 1. Dashboard StatCards -- Better Desktop Layout

The Dashboard currently renders 6 stat cards in a `lg:grid-cols-5` grid, which forces the 6th card ("Pendiente") to wrap alone to a second row. Change to `lg:grid-cols-6` so all cards fit in a single row on desktop.

**File:** `src/components/dashboard/StatCards.tsx`

## 2. Keyboard Shortcut for Global Search

Add a global keyboard shortcut (Ctrl+K / Cmd+K) that focuses the search input on any list page. This is a standard desktop productivity pattern. Implement by adding a `useEffect` listener inside `SearchBar` that watches for the shortcut and focuses its input via a ref. Show a subtle "Ctrl+K" hint badge inside the search field.

**File:** `src/components/SearchBar.tsx`

## 3. Table Row Hover Polish

Currently some table rows have hover styles (`hover:bg-muted/50`) and some also have `border-l-2 border-transparent hover:border-primary`. Standardize all `ListPageLayout` table rows with a consistent, refined hover: a subtle left-border accent + background shift. This is already partially done in Fleet; replicate to Invoices, Contracts, Quotes, Deliveries, Maintenance, Damage, Returns, and Audit.

**Files:** `src/pages/ContractsPage.tsx`, `src/pages/QuotesPage.tsx`, `src/pages/DeliveriesPage.tsx`, `src/pages/MaintenancePage.tsx`, `src/pages/DamageTrackingPage.tsx`, `src/pages/ReturnInspectionPage.tsx`, `src/pages/AuditTrailPage.tsx`

## 4. InvoiceDetail -- Collapse Actions into Dropdown on Desktop

The InvoiceDetail header can show up to 7 action buttons that wrap awkwardly. Group secondary actions (Edit, Stamp CFDI, Download XML, Cancel CFDI, Print) into a `DropdownMenu` labeled "Acciones", keeping only the primary action (Mark Sent/Paid, Record Payment) as standalone buttons. This declutters the header significantly.

**File:** `src/pages/InvoiceDetail.tsx`

## 5. ForkliftDetail -- Remove Fixed Widths

The "Change Status" section uses `w-[200px]` and `w-[280px]` which can look odd on wide screens. Replace with `flex-1 max-w-xs` so they scale proportionally within the card.

**File:** `src/pages/ForkliftDetail.tsx`

## 6. Remove App.css Boilerplate

`src/App.css` contains leftover Vite starter boilerplate (#root max-width, logo spin animation, etc.) that conflicts with the full-width sidebar layout. All styling is handled via `index.css` and Tailwind -- this file should be emptied or deleted.

**File:** `src/App.css`

## 7. ListPageLayout -- Show Item Count in Subtitle

Add an optional `totalCount` prop to `ListPageLayout` that appends "(X resultados)" to the subtitle. This gives users instant context on how many records exist vs. what's filtered. Apply to Fleet, Invoices, Contracts, Quotes, Deliveries, and other list pages.

**File:** `src/components/ListPageLayout.tsx` (add prop), plus each list page to pass the count.

## 8. DamageTrackingPage -- Add Consistent Table Row Hover + Filter Stacking

This page's filter row doesn't use the `flex-col sm:flex-row` pattern. Standardize it and add the hover border style to its table rows.

**File:** `src/pages/DamageTrackingPage.tsx`

---

## Technical Details

### SearchBar Keyboard Shortcut Pattern
```text
const inputRef = useRef<HTMLInputElement>(null);
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, []);
```

### InvoiceDetail Actions Dropdown Pattern
```text
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">
      <MoreHorizontal className="h-4 w-4 mr-1" /> Acciones
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={...}>
      <Edit className="h-4 w-4 mr-2" /> Editar
    </DropdownMenuItem>
    ...
  </DropdownMenuContent>
</DropdownMenu>
```

### Files to Modify
- `src/components/dashboard/StatCards.tsx` -- grid-cols-6
- `src/components/SearchBar.tsx` -- Ctrl+K shortcut + hint badge
- `src/components/ListPageLayout.tsx` -- totalCount prop
- `src/pages/InvoiceDetail.tsx` -- actions dropdown
- `src/pages/ForkliftDetail.tsx` -- remove fixed widths
- `src/pages/ContractsPage.tsx` -- hover style
- `src/pages/QuotesPage.tsx` -- hover style
- `src/pages/DeliveriesPage.tsx` -- hover style
- `src/pages/MaintenancePage.tsx` -- hover style
- `src/pages/DamageTrackingPage.tsx` -- hover style + filter fix
- `src/pages/ReturnInspectionPage.tsx` -- hover style
- `src/App.css` -- remove boilerplate

**Risk:** Low. All changes are UI-only with no backend impact. The dropdown pattern for InvoiceDetail is the most significant UX change but uses standard Radix components already in the project.
