
## Diagnóstico

Los dos números vienen de RPCs distintas y usan reglas distintas:

- **Card del dashboard ($426,000)** → `get_financial_kpis`: suma **todas** las bookings con `recurring_billing = true` cuyas fechas cubren hoy, **sin filtrar por `status`**.
- **Página /mrr ($396,000)** → `get_mrr_detail`: suma equipos con `forklifts.status = 'rented'` y booking activa con `status = 'confirmed'` (uno por forklift vía `LATERAL LIMIT 1`).

Ejecuté ambas queries contra la base y el delta de **$30,000** proviene 100% de un único registro:

| booking   | forklift            | booking.status | recurring_billing | monthly_rate |
|-----------|---------------------|----------------|-------------------|--------------|
| RSV-0013  | HPLTC015A0762/002   | **cancelled**  | true              | 30,000       |

RSV-0013 fue cancelada pero conservó `recurring_billing = true`, por lo que el KPI la sigue contando. Además, ese mismo forklift ya está rentado hoy por RSV-0016 (confirmada, $30,000), así que el KPI lo cuenta **dos veces**.

## Número correcto

**$396,000** (la página /mrr). Es la fuente de verdad declarada en memoria (`mem://features/mrr-detail-page`) y coincide con los equipos realmente rentados hoy. El card tiene el bug.

## Fix propuesto

Migración que reemplace `get_financial_kpis` para que el cálculo del MRR (actual y previo) agregue `AND b.status = 'confirmed'`. No se toca ninguna otra sección del RPC.

```sql
-- MRR actual
WHERE b.recurring_billing = true
  AND b.status = 'confirmed'          -- ← nuevo
  AND b.start_date <= v_today
  AND (b.end_date IS NULL OR b.end_date >= v_today);

-- MRR mes anterior: mismo filtro adicional
```

Con esto:
- RSV-0013 deja de contar → el card baja a $396,000, alineado con /mrr.
- Evita el doble conteo del mismo forklift (la exclusión GiST ya garantiza que sólo una booking `confirmed` por forklift solapa una fecha).

## Alcance

- 1 migración: `CREATE OR REPLACE FUNCTION public.get_financial_kpis()` con el filtro extra.
- Sin cambios de UI ni de otros RPCs.
- Verificación post-migración con `read_query` (esperado: `mrr = 396000`, `count = 16`).
- Entrada de changelog v7.98.1 (patch).

## Nota aparte (fuera del alcance de este fix)

RSV-0013 quedó con `recurring_billing = true` a pesar de estar cancelada; conviene, en un sprint aparte, agregar en el flujo/trigger de cancelación un `UPDATE bookings SET recurring_billing = false` para prevenir que reservas canceladas ensucien futuros KPIs y facturación recurrente. Lo puedo dejar como BL nuevo si quieres.
