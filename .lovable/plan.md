

## Fix: Sincronizar `paid_at` al editar pagos — v5.17.2

### Problema
`useUpdatePayment` actualiza el status de la factura (paid/partial/sent) pero nunca toca `paid_at`. Al editar la fecha de un pago, el card de "Fechas" no refleja el cambio.

### Solución
Modificar `useUpdatePayment` en `src/hooks/usePayments.ts` para:

1. Cuando el balance ≤ 0 → marcar `status: "paid"` **y** `paid_at` = fecha del pago más reciente (de todos los pagos de esa factura).
2. Cuando el balance > 0 → marcar `status: "partial"` **y** `paid_at: null` (ya no está completamente pagada).
3. Cuando no hay pagos → `status: "sent"` **y** `paid_at: null`.

Esto replica el mismo comportamiento que ya tiene `useCreatePayment` (que sí pasa `paid_at`).

### Cambios
| Archivo | Cambio |
|---------|--------|
| `src/hooks/usePayments.ts` | En `useUpdatePayment`, consultar fecha más reciente de pagos y actualizar `paid_at` junto con `status` |
| `public/changelog.json` | Entrada v5.17.2 |

### Detalle técnico
En el bloque que recalcula status (líneas 95-105), cambiar:
- `{ status: "paid" }` → `{ status: "paid", paid_at: latestPaymentDate }`
- `{ status: "partial" }` → `{ status: "partial", paid_at: null }`
- `{ status: "sent" }` → `{ status: "sent", paid_at: null }`

Donde `latestPaymentDate` se obtiene consultando `MAX(payment_date)` de los pagos de esa factura.

