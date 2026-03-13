

## Performance Analysis and Optimization Recommendations

### 1. `useAuth()` creates independent state per call site (Critical)

`useAuth` uses `useState`/`useEffect` internally, meaning **every component that calls it creates its own subscription and state**. It's called in ~10 places (AuthGuard, AppSidebar, useUserRole, useRolePermissions, CustomerPortalLayout, UserManagementPage, PortalLogin, AuthPage, useCustomerPortal). Each instance independently calls `getSession()` and subscribes to `onAuthStateChange`.

**Fix**: Convert `useAuth` to use a React Context provider (or a Zustand/Jotai atom) so there's a single subscription and shared state. Alternatively, use TanStack Query with `queryKey: ["auth-session"]` and `staleTime: Infinity` so the session is fetched once and shared.

---

### 2. `useForklifts()` fetched everywhere without `staleTime` (High)

`useForklifts()` is called in **15+ components** (Fleet, CalendarPage, QuoteDetail, ReportDamageDialog, BookingActions, IncomeStatementPage, ContractForm, AssignForkliftsCard, useAvailableForklifts, useInvoiceFormLogic, ReportsPage, ForkliftForm, MaintenancePoliciesTab, useForkliftMap). It has **no `staleTime`**, so TanStack Query defaults to `staleTime: 0` — meaning every mount triggers a background refetch.

Same issue applies to: `useBookings()`, `useCustomers()`, `useInvoices()`, `useMaintenanceLogs()`, `useActivityFeed()`, `useCompanySettings()`.

**Fix**: Add `staleTime: 60_000` (or more) to frequently-used, slowly-changing queries like forklifts, customers, company_settings. Only `role_permissions` and `dashboard-stats` currently have `staleTime` set.

---

### 3. `useAvailableForklifts` triggers 3 full-table fetches (High)

This hook calls `useForklifts()`, `useBookings()`, AND `useMaintenanceLogs()` — three full-table queries — just to compute availability for a date range. This runs on every mount of the booking form.

**Fix**: Create a database function `get_available_forklifts(p_start date, p_end date)` that returns only available units for the range, replacing 3 client-side queries with 1 server-side query.

---

### 4. `useBookings()` always fetches ALL bookings (Medium-High)

When called without a `forkliftId`, it fetches the entire bookings table with a join. Pages like CalendarPage, IncomeStatementPage, ReportsPage, ContractForm, and useAvailableForklifts all do this.

**Fix**: Add date-range filtering to `useBookings` for pages that only need recent/active bookings. The CalendarPage and Gantt chart only display one month at a time but load all historical bookings.

---

### 5. Dashboard triggers 3 parallel queries that overlap (Medium)

The Dashboard page calls `useDashboardStats()` (the RPC), `useActivityFeed(5)`, and implicitly `useUserRole()`, `useRolePermissions()`, `useCompanySettings()` via sidebar/guard. The activity feed could be folded into the RPC to eliminate one round-trip.

**Fix**: Add `recent_activity` to the `get_dashboard_stats` RPC function, removing the separate `useActivityFeed` call on the dashboard.

---

### 6. `QueryClient` has no global defaults (Medium)

```ts
const queryClient = new QueryClient();
```

No default `staleTime`, `gcTime`, or `retry` is set. This means all queries default to `staleTime: 0` (refetch on every mount) and `retry: 3` (3 retries on failure, adding latency on errors).

**Fix**:
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});
```

---

### 7. ReportsPage and IncomeStatementPage load ALL data client-side (Medium)

Both pages fetch full tables (forklifts, bookings, invoices, maintenance_logs, operating_expenses) and compute aggregations in JavaScript. For a growing dataset this becomes progressively slower.

**Fix**: Create server-side RPC functions for report aggregations (similar to `get_dashboard_stats`) and pass date-range parameters.

---

### 8. No `React.memo` on heavy list items (Low-Medium)

Components like `GanttChart`, `EquipmentListView`, `BookingRow`, and table rows in list pages re-render whenever parent state changes (e.g., navigation, date changes). The Gantt chart does significant date math per row.

**Fix**: Wrap pure presentational row components with `React.memo`. Memoize expensive derived data with `useMemo` (some already do this, but not consistently).

---

### 9. jsPDF imported eagerly in PDF button components (Low-Medium)

`QuotePDFButton`, `InvoicePDFButton`, `ContractPDFButton` import jsPDF and PDF generation logic at the module level. jsPDF is ~200KB+ and only needed when the user clicks "Generate PDF".

**Fix**: Dynamic import jsPDF only when the button is clicked:
```ts
const onClick = async () => {
  const { generatePDF } = await import("@/lib/quotePdfPremium");
  // ...
};
```

---

### 10. `useForkliftMap` vs inline `useMemo` duplication (Low)

`useForkliftMap` exists as a shared hook, but CalendarPage still creates its own `forkliftMap` via inline `useMemo` + `useForklifts()`. This causes a redundant query when both patterns coexist on the same page tree.

**Fix**: Consistently use `useForkliftMap()` everywhere instead of inline patterns.

---

### Summary of impact (ordered by priority)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 6 | Set global `staleTime` on QueryClient | High | Trivial |
| 1 | Convert `useAuth` to shared context | High | Low |
| 2 | Add `staleTime` to hot queries | High | Low |
| 3 | Server-side available forklifts query | High | Medium |
| 4 | Date-filter `useBookings` | Medium | Low |
| 5 | Fold activity into dashboard RPC | Medium | Low |
| 7 | Server-side report aggregations | Medium | High |
| 9 | Lazy-load jsPDF | Medium | Low |
| 8 | `React.memo` on list rows | Low | Low |
| 10 | Consolidate forkliftMap usage | Low | Trivial |

