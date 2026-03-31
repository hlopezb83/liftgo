

## Fix: Consistencia en conteo de "Rentados" y "Utilización"

### Problema

`get_dashboard_stats` calcula `fleet_counts.rented` como `COUNT(*) FILTER (WHERE status = 'rented')`, lo cual incluye montacargas sin reserva activa. La utilización usa este mismo número, resultando en un % inflado.

### Solución

Actualizar `get_dashboard_stats` para calcular `rented` con la misma lógica que el MRR: solo contar montacargas con `status = 'rented'` Y que tengan un booking `confirmed` vigente.

### Cambio

**1. Migración SQL** — actualizar `fleet_counts.rented` en `get_dashboard_stats`

Reemplazar:
```sql
'rented', COUNT(*) FILTER (WHERE status = 'rented'),
```

Por:
```sql
'rented', COUNT(*) FILTER (WHERE status = 'rented'
  AND EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.forklift_id = forklifts.id
      AND b.status = 'confirmed'
      AND CURRENT_DATE BETWEEN b.start_date AND b.end_date
  )),
```

La utilización en el frontend (`Dashboard.tsx`) no necesita cambios — ya usa `counts.rented`, que ahora será correcto.

**2. `src/lib/changelog.ts`** — registrar fix v5.10.3

### Archivos
- 1 migración SQL
- `src/lib/changelog.ts`

