## Auditoría v7.89.0 (Sprint 3)

**Tests:** 1040/1040 Vitest en verde. 6 tests nuevos para `prorateDepreciation` (mes completo, día frontera, febrero 28, costo 0/nulo, días negativos, cap a `daysInMonth`). Guard de rol en `get_income_statement` confirmado vía `permission denied` desde `read_query` anon.

**Formato:** `deno fmt --check` limpio en los 72 edge functions después de reformatear `generate-recurring-invoices/index.ts`.

### Bug encontrado — BL-17 dejó constraint más débil

Cambié el `daterange` de `no_overlapping_bookings` de `[]` (inclusivo) a `[)` (semi-abierto) para permitir rotación mismo día. **Efecto colateral:** en Postgres, `daterange(d, d, '[)')` es un rango vacío. Cualquier reserva de un solo día (`start_date = end_date`) queda como rango vacío y ya no se solapa con nada — permite doble booking del mismo equipo el mismo día. Verificado en SQL: `isempty(daterange('2026-07-15','2026-07-15','[)')) = true`.

**Estado hoy:** 0 reservas con `start_date = end_date` en la BD, así que no hay corrupción. La constraint sí quedó más débil que la original para ese edge case, y no hay CHECK constraint que exija `end_date > start_date`.

**Decisión:** revertir sólo el rango a `[]` y mantener la parte útil del fix (excluir `completed`). La "rotación mismo día" era una ambición fuera del hallazgo BL-17 original y no compensa el riesgo. En rentas encadenadas normales el usuario ya utiliza `end_date = día de retorno`, `start_date siguiente = día siguiente`.

### Otros hallazgos: nada roto

- `computeProrate` y `prorateDepreciation` son puros y están cubiertos.
- `get_income_statement`: reescritura mantiene el guard de rol; no toca contratos existentes; los meses ausentes siguen apareciendo con 0 gracias a `all_months`.
- `expenses_by_month` con `LEFT JOIN supplier_payments`: verificado que en accrual el join no aporta filas (el `WHERE ... p_basis='cash' AND sp.id IS NOT NULL` filtra); en cash sólo agrupa pagos dentro del rango. Sin duplicados.
- `rented_days_agg` capea al `days_in_month` para evitar sobrecuenta cuando un mismo forklift tiene reservas solapadas en el mismo mes.

### Gaps de tests (no bloqueantes)

- No hay test de integración SQL para `get_income_statement` (limitación estructural del proyecto — no seedeamos escenarios financieros completos). Los helpers puros sí están cubiertos.
- No hay E2E para la constraint `no_overlapping_bookings`. Se puede agregar en un sprint posterior como parte de la suite Playwright de disponibilidad.

---

## Sprint 4 — v7.89.1 (patch)

### Alcance

**Único ítem: revertir el rango `[)` a `[]` en `no_overlapping_bookings`.** Mantener la exclusión de `completed` (parte válida del fix BL-17).

**Migración:**

```sql
ALTER TABLE public.bookings DROP CONSTRAINT no_overlapping_bookings;

ALTER TABLE public.bookings
  ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    forklift_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'completed'));
```

### Riesgos

Ninguno: hoy 0 reservas de un día. La constraint queda más estricta que la versión de v7.89.0 (correcto) y ligeramente más permisiva que pre-v7.89.0 en cuanto a liberar fechas de reservas `completed` (comportamiento deseado).

### Tests

No requiere tests nuevos: es reversión de un parámetro y no afecta código de aplicación. Vitest completo se corre para confirmar 1040/1040.

### Cierre de auditoría BL-01..BL-20

Con este patch, la ronda profunda de auditoría de lógica de negocio (20 hallazgos) queda cerrada. Documentar el estado final en `public/changelog/v7.89.1.json` como confirmación explícita.

### Archivos a modificar

- Migración: `no_overlapping_bookings` revertir a `[]`.
- `public/changelog.json` + `public/changelog/v7.89.1.json`.
