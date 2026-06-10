# E2E Roadmap — LiftGo

## Estado actual (v6.37.3)

**Lote 10 — Happy paths Playwright: COMPLETADO.**

### Patrón seed/teardown

Los tests E2E que necesitan datos reproducibles usan el fixture `seed` definido en `tests/e2e/fixtures/seed.ts`:

```ts
import { test, expect } from "./fixtures/seed";

test("flujo X", async ({ page, seed }) => {
  // seed.invoice_id, seed.booking_number, seed.total, etc.
});
```

Detrás del fixture:

1. **`e2e_seed_scenario()`** (RPC admin-only) crea un escenario completo: modelo de equipo, montacargas disponible, cliente, cotización aceptada, reserva confirmada y factura emitida — todos marcados con `is_e2e = true`. Devuelve un JSON con todos los ids.
2. **`e2e_teardown()`** (RPC admin-only) borra en orden seguro sólo las filas con `is_e2e = true`. Se ejecuta automáticamente al final de cada test que usa el fixture.

Ambas RPCs son `SECURITY DEFINER` con `SET search_path = public` y validan que el caller tenga rol `admin` vía `has_role(auth.uid(),'admin')`.

### Specs cubiertos

| Spec | Flujo |
|---|---|
| `quote-to-booking.spec.ts` | Cotización aceptada → reserva confirmada visible en lista |
| `booking-to-invoice.spec.ts` | Reserva → factura emitida visible con link de reserva |
| `invoice-payment.spec.ts` | Factura emitida → pago total → estado pagada |
| `quote-pdf.spec.ts` | Cotización → descarga PDF con prefijo COT- |
| `customer-create.spec.ts` | Alta de cliente vía UI con RFC genérico |
| `auth.spec.ts` | Login y acceso al dashboard |
| `portal.spec.ts` | Smoke del portal de cliente |
| `smoke-nav.spec.ts` | 31 rutas internas del admin |

### Variables requeridas en CI

- `E2E_TEST_EMAIL` — cuenta con rol `admin` en `public.user_roles`
- `E2E_TEST_PASSWORD`
- `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (ya en `.env`)

## Pendiente

- **pgTAP / RLS reales contra Postgres**: complementan al Lote 11 (mocks Vitest) con validación real de policies usando usuarios sembrados por rol. Propuesta separada.
- **Specs adicionales**: CRM (deal won), mantenimiento (kanban), retornos, contratos. Cada uno requiere extender `e2e_seed_scenario` o crear seeds dedicados.
