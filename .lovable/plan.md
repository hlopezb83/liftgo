

## Fix: MRR muestra montacargas sin reserva activa

### Causa raíz

La RPC `get_mrr_detail` usa `LEFT JOIN LATERAL` para buscar la reserva activa. Esto provoca que montacargas con `status = 'rented'` aparezcan en la lista aunque no tengan un booking confirmado que cubra la fecha de hoy.

### Solución

Cambiar `LEFT JOIN LATERAL` a `JOIN LATERAL` (INNER JOIN) en la función RPC. Esto filtra automáticamente los montacargas que no tienen una reserva activa vigente.

### Cambio

**1. Migración SQL** — actualizar función `get_mrr_detail`
- Línea 29: `LEFT JOIN LATERAL` → `JOIN LATERAL`  
- Línea 37: `LEFT JOIN` en customers se mantiene (el customer siempre debería existir si hay booking, pero por seguridad)

Resultado: solo aparecen montacargas que tienen un booking `confirmed` con `CURRENT_DATE BETWEEN start_date AND end_date`.

**2. `src/lib/changelog.ts`** — registrar fix

### Archivos
- 1 migración SQL
- `src/lib/changelog.ts`

