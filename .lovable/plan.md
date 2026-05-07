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

#### Tanda 2 — Alto ✅ COMPLETADO en v5.63.0
5. ~~**HI-2 Rate limit**~~ — tabla `rate_limits` + RPC `check_and_record_rate_limit` + helper `enforceRateLimit` (10/min por admin) aplicado a las 5 funciones admin.
6. ~~**HI-3 Password predecible**~~ — `generateSecurePassword` con rejection sampling en `_shared/auth.ts`. `invite-customer` usa 24 chars sin sufijo fijo.
7. ~~**HI-4 Refactor auth**~~ — `requireAuth`/`requireRole`/`requireAdmin` extraídos a `_shared/auth.ts`. Aplicado a invite-user, invite-customer, delete-user, toggle-user-status, reset-user-password.

#### Tanda 3 — Medio/Bajo ✅ COMPLETADO en v5.64.0
8. ~~**MI-2** Pattern matching de rutas~~ — nuevo `getModuleForPath()` con prefijo descendente (cubre `/fleet/:id/edit`, `/quotes/new`, etc.).
9. ~~**MI-4 Lockfile dual**~~ — `package-lock.json` eliminado.
10. ~~**MI-5 Regex de email**~~ — `_shared/validate.ts` endurecido (TLD ≥ 2, sin puntos consecutivos, longitud 6-254).
11. **MI-6 Logging estructurado** — diferido. Hoy `telemetry` es placeholder console-only; conectar a tabla cuando se decida proveedor (Sentry vs in-DB).
12. ~~**LO-1** rejection sampling en `generateSecurePassword`~~ — ya entregado en Tanda 2 (v5.63.0).
13. ~~**LO-3** Timeout en `PageFallback`~~ — botón "Recarga la página" tras 10s.
14. ~~**LO-4** Telemetría en `getAccessLevel`~~ — usa `telemetry.warn()` desde `src/lib/telemetry.ts`.

## Estado final
Tandas 1, 2 y 3 cerradas. Único pendiente: **MI-6 (logging persistente)** sujeto a decisión de proveedor.

## Entregables por tanda

Cada tanda termina con:
- Cambios de código + migración DB si aplica.
- Entrada nueva en `public/changelog.json` y `public/changelog/v{X.Y.Z}.json`.
- Tests unitarios donde aplique (idempotencia de facturación, rate limit, timezone).

## Recomendación

Empezar por **Tanda 1** ya, porque CR-3 (facturas duplicadas) y CR-4 (timezone) tienen impacto financiero directo. ¿Apruebas que ejecute la Tanda 1 completa en una sola entrega?
