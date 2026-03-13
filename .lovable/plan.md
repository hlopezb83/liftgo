

# Plan: App.tsx Structural Refactor

The audit raises valid points. However, some recommendations (like feature-sliced design) would create a massive diff with moderate benefit given the project already organizes domain components into subdirectories. Here is what is practical and high-value.

## What we will do

### 1. Extract `AppProviders` wrapper
Create `src/components/AppProviders.tsx` containing all nested providers (ThemeProvider, QueryClientProvider, AuthProvider, TooltipProvider, Toaster, Sonner). This reduces App.tsx from a deeply nested provider tree to a single `<AppProviders>` wrapper.

### 2. Create `MainLayout.tsx` using `<Outlet />`
Create `src/layouts/MainLayout.tsx` with the sidebar, header, and error boundary — mirroring the existing `CustomerPortalLayout.tsx` pattern which already uses `<Outlet />` correctly. This replaces the inline layout JSX in App.tsx.

### 3. Extract route config to `src/routes.tsx`
Move the lazy imports, `routes` array, `RouteConfig` interface, `PageFallback`, and `NoAccess` components into a dedicated file. App.tsx becomes ~15 lines.

### 4. Use layout routes instead of wildcard catch-all
Replace the current `<Route path="*">` + nested `<Routes>` pattern with a proper layout route:
```text
<Route element={<AuthGuard><MainLayout /></AuthGuard>}>
  {routes.map(...)}
</Route>
```
This eliminates the double `<Routes>` nesting and aligns with react-router-dom v6 best practices.

## What we will NOT do (and why)

- **Feature-sliced directory restructuring**: The project already has `src/components/invoices/`, `src/components/bookings/`, etc. Moving hooks into those folders would touch 50+ import paths across the entire codebase for marginal gain. The current `hooks/` flat directory is searchable and consistent.
- **Frontend domain model layer**: The `as any` issue is a types problem (addressed in prior audit). Adding an abstraction layer between Supabase types and components adds complexity without solving the root cause.

## Resulting structure

```text
src/App.tsx              (~15 lines — just AppProviders + BrowserRouter + routes)
src/components/AppProviders.tsx   (all context providers)
src/layouts/MainLayout.tsx        (sidebar + header + Outlet)
src/routes.tsx                    (lazy imports, route config, fallbacks)
```

## Files changed
- `src/App.tsx` — simplified to compose the 3 extracted pieces
- `src/components/AppProviders.tsx` — new
- `src/layouts/MainLayout.tsx` — new
- `src/routes.tsx` — new
- `src/lib/changelog.ts` — version bump

