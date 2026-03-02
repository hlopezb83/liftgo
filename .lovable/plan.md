

## Corregir fecha de pago en factura

### Problema
Cuando se registra un pago con una fecha en el pasado, el sistema ignora esa fecha y marca la factura con la fecha de hoy. Esto ocurre en dos lugares:

1. **`useCreatePayment`** (linea 64 de `src/hooks/usePayments.ts`): Al detectar que la factura queda saldada, usa `new Date()` en vez de la fecha del pago registrado.
2. **`InvoiceDetail.tsx`**: El boton "Marcar Pagada" tambien usa `new Date()` en vez de permitir elegir una fecha.

### Solucion

**Archivo 1: `src/hooks/usePayments.ts`**
- Linea 64: Cambiar `new Date().toISOString().split("T")[0]` por `payment.payment_date`, que ya contiene la fecha seleccionada por el usuario.

**Archivo 2: `src/pages/InvoiceDetail.tsx`**
- En el boton "Marcar Pagada", cambiar la fecha hardcodeada por la fecha actual, lo cual es aceptable para este caso (accion manual directa). Este comportamiento ya es correcto conceptualmente ya que el usuario esta marcando la factura como pagada "ahora".

### Cambio principal

Solo 1 linea en `usePayments.ts`:

```text
// Antes (linea 64):
paid_at: new Date().toISOString().split("T")[0]

// Despues:
paid_at: payment.payment_date
```

Esto garantiza que cuando se registra un pago y la factura queda saldada automaticamente, la fecha `paid_at` refleje la fecha real del pago, no la fecha en que se registro en el sistema.

