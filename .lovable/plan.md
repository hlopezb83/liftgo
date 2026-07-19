# Cierre de auditoría — BL-33 y BL-23

Verifiqué contra la base actual: ambos bugs siguen abiertos.
- `accept_quote_from_portal` y `convert_quote_to_bookings` **no** miran `valid_until`.
- No existe `mark_overdue_supplier_bills` ni job de pg_cron equivalente; `recalc_supplier_bill` solo corre en eventos de pago.

## Sprint v7.98.0

### 1. BL-33 — Guardas de vigencia en cotizaciones
Migración con `CREATE OR REPLACE FUNCTION` para las dos RPCs, agregando tras los chequeos de estatus:

```sql
IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
  RAISE EXCEPTION 'Cotización vencida';
END IF;
```

En `convert_quote_to_bookings` el mensaje será `'Cotización vencida: actualiza precios y vigencia antes de convertir'`. **Bloqueo simple, sin override** (recomendación del documento — re-cotizar es más sano para el historial comercial).

### 2. BL-23 — Flip diario de facturas de proveedor vencidas
Migración con:
- `public.mark_overdue_supplier_bills()` SECURITY DEFINER, `search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO service_role`.
- Marca `pending → overdue` cuando `balance > 0` y `due_date < CURRENT_DATE`.
- Reversa `overdue → pending` si `due_date` quedó NULL o a futuro.
- **No toca `partial`** (mantiene contrato de `recalc_supplier_bill`).
- Job pg_cron `mark-overdue-supplier-bills-daily` a las `10 7 * * *` UTC (01:10 Mty), con re-schedule idempotente (unschedule por `jobname` antes de `cron.schedule`).

### 3. Tests
- `supabase/functions/_shared/…` o test Vitest con mocks de RPC:
  - Aceptar cotización vencida desde portal → error, estatus intacto.
  - Convertir cotización vencida → excepción, sin reservas creadas.
  - Caso feliz (`valid_until` futuro o NULL) sigue funcionando.
  - `mark_overdue_supplier_bills`: pending vencida → overdue; partial vencida → intacta; overdue con fecha futura → pending.

### 4. Changelog
Nueva entrada v7.98.0 en `public/changelog.json` + `public/changelog/v7.98.0.json` con las dos líneas sugeridas (BL-33 y BL-23).

## Detalles técnicos
- Dos migraciones separadas (una por issue) para trazabilidad.
- El drop de `maintenance_logs.performed_by` mencionado en v7.97.0 como backlog **no** entra en este sprint (fuera de alcance).
- Sin cambios de frontend.
