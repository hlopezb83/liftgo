## Diagnóstico

RSV-0018, RSV-0019 y RSV-0020 (LOGISTORAGE, inicio 19/06/2026) tienen `last_billed_date = 2026-06-30` **pero cero facturas vinculadas** en `invoice_bookings`. Una corrida previa avanzó el "último facturado" sin que la factura quedara creada/vinculada, por lo que la edge function considera que el siguiente período es julio 2026 (futuro) y responde "no hay reservas pendientes".

Las demás reservas recurrentes sí tienen facturas vinculadas correctamente, así que el problema está acotado a esas 3.

## Plan

### 1. Recuperación inmediata (datos)
Resetear `last_billed_date = NULL` solo para RSV-0018/0019/0020. En la próxima corrida la función:
- Calculará `billingStart = 2026-06-01`, `billingEnd = 2026-06-30`.
- Agrupará las 3 por `(LOGISTORAGE, 2026-06-01, 2026-06-30)`.
- Generará **una sola factura** con 3 conceptos (1 por montacargas a $18,500/mes).

### 2. Blindaje de la edge function (`supabase/functions/generate-recurring-invoices/index.ts`)
Para que esto no vuelva a ocurrir si una corrida falla a mitad de camino:

- **Sanidad de `last_billed_date`**: antes de calcular `billingStart`, validar que exista al menos un `invoice_bookings` para esa reserva cuyo `billing_period_end = last_billed_date`. Si no existe, tratar la reserva como si nunca hubiera sido facturada (usar `start_date`). Esto autorrepara inconsistencias futuras sin intervención manual.
- **Orden de escritura más seguro**: invertir el orden actual a `invoices` → `invoice_bookings` → `bookings.last_billed_date`. Si el insert del pivote falla, **no** avanzar `last_billed_date` y, además, borrar la factura recién creada para evitar facturas huérfanas.
- **Idempotencia robusta**: la rama "ya existe factura para el período" sigue avanzando `last_billed_date` solo cuando efectivamente se encuentra una factura vinculada.

### 3. Tests
Ampliar `supabase/functions/generate-recurring-invoices/index_test.ts` con:
- Reserva con `last_billed_date` pero sin pivote → se considera no facturada y se incluye en la corrida.
- Fallo simulado al insertar pivote → la factura se elimina y `last_billed_date` no avanza.

### 4. Changelog
Nueva entrada `v6.80.1` (patch) describiendo el bugfix y la autorrecuperación.

## Detalles técnicos

```text
Flujo nuevo por grupo:
  ├─ buscar facturas existentes para (customer_id, período)
  │     ├─ existe → marcar last_billed_date y continuar
  │     └─ no existe ↓
  ├─ INSERT invoices                        (1)
  ├─ INSERT invoice_bookings (N filas)      (2) ── si falla: DELETE invoice (1)
  └─ UPDATE bookings.last_billed_date       (3)
```

```text
Sanidad de last_billed_date al calcular billingStart:
  if last_billed_date IS NOT NULL:
      SELECT 1 FROM invoice_bookings ib
        JOIN invoices i ON i.id = ib.invoice_id
       WHERE ib.booking_id = :id
         AND i.billing_period_end = :last_billed_date
      LIMIT 1
      → si no encuentra: tratar la reserva como nunca facturada.
```

## Fuera de alcance
- No se toca la UI de facturas ni el botón "Generar recurrentes".
- No se modifican otras reservas ni se re-emiten facturas existentes.
- No se cambia el cálculo de tarifa ni la lógica de agrupación.
