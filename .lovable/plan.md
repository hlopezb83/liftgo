# Plan de remediación — Auditoría Greg

## Estado actual de los 19 hallazgos

### Ya resueltos (no requieren acción)
- **HI-1** Rutas `/return-inspections` vs `/returns` → corregido en **v5.61.1**.
- **HI-5** `next-themes` desactualizado → actualizado a `^0.4.6` en **v5.61.2**.
- **MI-1** `useUserRole` jerarquía hardcodeada → ya está derivada de DB (memoria `Domain Constants`).

### Falsos positivos / no aplican a este stack
- **MI-3** Refresh proactivo de tokens — `supabase-js` v2 ya refresca automáticamente cuando el cliente se inicializa con `autoRefreshToken: true` (default). Agregar un `setInterval` sería redundante.
- **LO-2** `host: '::'` en `vite.config.ts` — solo afecta dev local; el preview de Lovable lo requiere. No es vulnerabilidad en producción (build estático).

### Hallazgos reales a corregir

#### Tanda 1 — Crítico (esta sesión, una sola entrega)
1. **CR-1 CORS restrictivo** — reemplazar regex `*.lovable.app` en `supabase/functions/_shared/cors.ts` por allowlist explícita: preview URL, published URL (`liftgo.lovable.app`) y dominios custom. Permitir override por env var `ALLOWED_ORIGINS`.
2. **CR-2 ErrorBoundary global** — crear `src/components/ErrorBoundary.tsx` con UI minimalista industrial (botón "Recargar" + "Volver al inicio"), envolver `<App />` en `main.tsx`. Loggear a `console.error` (telemetría futura opcional).
3. **CR-3 Idempotencia de facturación recurrente** — en `generate-recurring-invoices`: antes de insertar, verificar que no exista ya una `invoice` con `(subscription_id, billing_period_start, billing_period_end)`. Idealmente vía índice único parcial en DB + `ON CONFLICT DO NOTHING`.
4. **CR-4 Timezone Monterrey en facturación** — usar `date-fns-tz` con `America/Monterrey` para calcular `billingStart`/`billingEnd`/`due_date` en lugar de `new Date()` UTC. Coincide con regla de memoria `Localization: Dates`.

#### Tanda 2 — Alto (siguiente entrega)
5. **HI-2 Rate limit en Edge Functions admin** — agregar helper `_shared/rateLimit.ts` (token bucket en tabla `rate_limits` o memoria por instancia) aplicado a `invite-user`, `delete-user`, `toggle-user-status`, `invite-customer`. Límite sugerido: 10 req/min por usuario admin.
6. **HI-3 Password temporal predecible en `invite-customer`** — reemplazar `crypto.randomUUID() + 'Aa1!'` por `generateSecurePassword()` que ya existe en `invite-user`. Mover el helper a `_shared/auth.ts`.
7. **HI-4 Refactor de auth duplicada** — extraer a `_shared/auth.ts`:
   - `requireAuth(req): { user, supabase }`
   - `requireRole(req, roles[]): { user, supabase }`
   - `requireAdmin(req)` (atajo)
   Refactorizar las ~14 funciones para usar estos helpers. Reduce ~30 LOC por función.

#### Tanda 3 — Medio/Bajo (sprint siguiente)
8. **MI-2** Completar `ROUTES_TO_MODULE` con pattern matching (`startsWith`) para subrutas como `/fleet/new`, `/quotes/new`, `/bookings/:id`, etc.
9. **MI-4 Lockfile dual** — eliminar `package-lock.json` (usamos Bun). Agregar nota en README.
10. **MI-5 Regex de email muy permisivo** — endurecer `isEmail` en `_shared/validate.ts` (requerir TLD ≥ 2 chars, dominio válido) — crítico para CFDI.
11. **MI-6 Logging estructurado** — opcional: tabla `function_logs` con `function_name`, `level`, `payload`, `created_at`. RLS solo admin lectura.
12. **LO-1** Reescribir `generateSecurePassword` con rejection sampling para eliminar bias del módulo.
13. **LO-3** Agregar timeout de 10s en `PageFallback` con mensaje "Recarga la página".
14. **LO-4** Reemplazar `console.warn` en `getAccessLevel` por hook de telemetría (placeholder ahora, conectar a Sentry/log table después).

## Entregables por tanda

Cada tanda termina con:
- Cambios de código + migración DB si aplica.
- Entrada nueva en `public/changelog.json` y `public/changelog/v{X.Y.Z}.json`.
- Tests unitarios donde aplique (idempotencia de facturación, rate limit, timezone).

## Recomendación

Empezar por **Tanda 1** ya, porque CR-3 (facturas duplicadas) y CR-4 (timezone) tienen impacto financiero directo. ¿Apruebas que ejecute la Tanda 1 completa en una sola entrega?
