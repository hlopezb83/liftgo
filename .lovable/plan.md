
## Audit findings

`src/contexts/AuthContext.tsx` and `src/layouts/AuthGuard.tsx` **already implement the requested behavior**:

- `AuthProvider` exposes a `loading` state initialized to `true`. It's flipped to `false` only after Supabase emits the first auth event (`INITIAL_SESSION` from `onAuthStateChange`, which fires synchronously on subscribe and is equivalent to `getSession()` — the comment in the file explains this is intentional to avoid a duplicate render).
- `AuthGuard` already gates rendering on `loading || (user && roleLoading)` and shows the LiftGo blob spinner with "Cargando tu espacio de trabajo…" until both session and role are resolved. There is no flash-of-login-screen today.
- `RoleGuard` consumes the resolved role downstream, so protected routes never render before auth completes.

So the user-visible behavior already matches the request. The remaining work is **naming alignment + a safety net**, not a behavioral fix.

## Plan

### 1. Rename `loading` → `isLoading` in `AuthContext`
- Update the `AuthContextValue` interface and the `useState` to `isLoading`.
- Update the provider's value object.
- Find & update all consumers (grep `useAuth()` destructuring of `loading`): `AuthGuard.tsx` and any auth-related components/hooks (`AuthForm`, `AuthPage`, sidebar footer, portal routes, etc.). Adjust each call site to `isLoading`.

This aligns with the user's wording and our `isLoading` convention used elsewhere (e.g. `roleLoading` → already `isLoading` from TanStack Query).

### 2. Add a defensive `getSession()` bootstrap
Although `onAuthStateChange` does emit `INITIAL_SESSION`, if that emission ever fails (network blip, SDK bug), `isLoading` would stay `true` forever and the spinner would hang. Add a belt-and-suspenders pattern recommended by Supabase docs:

```ts
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
    setSession(s); setUser(s?.user ?? null); setIsLoading(false);
  });
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session); setUser(session?.user ?? null); setIsLoading(false);
  });
  return () => subscription.unsubscribe();
}, []);
```

Order matters: subscribe first, then call `getSession()` (matches Lovable's auth pattern). Both setters are idempotent.

### 3. Keep `AuthGuard` fallback as-is
The current spinner already satisfies the "loading skeleton or spinner" requirement. Just update the destructure to `isLoading`.

### 4. Changelog
Add `6.22.5` patch entry to `public/changelog.json` + `public/changelog/v6.22.5.json` documenting the rename and the defensive bootstrap.

## Files touched

- `src/contexts/AuthContext.tsx` — rename + add `getSession()` bootstrap
- All `useAuth()` consumers that read `loading` — rename to `isLoading`
- `public/changelog.json` + `public/changelog/v6.22.5.json`

No DB, no routing layout, no styling changes.
