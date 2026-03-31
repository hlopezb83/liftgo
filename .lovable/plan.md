

## Fix: MRR inconsistente entre tarjeta KPI y página de detalle

### Causa raíz

Las dos funciones RPC calculan el MRR de forma diferente:

| Función | Lógica |
|---|---|
| `get_financial_kpis` (tarjeta KPI) | `SUM(monthly_rate) FROM forklifts WHERE status = 'rented'` — incluye TODOS los montacargas con status "rented", tengan o no reserva activa |
| `get_mrr_detail` (página detalle) | `JOIN LATERAL` con bookings confirmados vigentes — solo incluye los que tienen reserva activa hoy |

La página de detalle tiene la lógica correcta (solo montacargas con reserva activa). La tarjeta KPI tiene la lógica incorrecta.

### Solución

Actualizar `get_financial_kpis` para que calcule el MRR con la misma lógica que `get_mrr_detail`: sumando `monthly_rate` solo de montacargas que tengan un booking `confirmed` vigente (`CURRENT_DATE BETWEEN start_date AND end_date`).

### Cambio

**1. Migración SQL** — actualizar la sección MRR de `get_financial_kpis`

Reemplazar:
```sql
SELECT COALESCE(SUM(monthly_rate), 0) INTO v_mrr
FROM forklifts WHERE status = 'rented';
```

Por:
```sql
SELECT COALESCE(SUM(f.monthly_rate), 0) INTO v_mrr
FROM forklifts f
WHERE f.status = 'rented'
  AND EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = f.id
      AND b.status = 'confirmed'
      AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
  );
```

**2. `src/lib/changelog.ts`** — registrar fix

### Archivos
- 1 migración SQL
- `src/lib/changelog.ts`

