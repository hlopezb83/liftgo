

## Sincronizar monto predeterminado con saldo pendiente

### Problema
El `useState` solo toma el valor de `balance` en el primer render. Si el balance cambia (por pagos previos), el monto no se actualiza al abrir el diálogo.

### Cambio

**Archivo: `src/components/RecordPaymentDialog.tsx`**

Agregar un `useEffect` que actualice el monto cada vez que el diálogo se abra o el balance cambie:

```typescript
import { useState, useEffect } from "react";

// Después de los useState existentes:
useEffect(() => {
  if (open) {
    setAmount(balance.toFixed(2));
  }
}, [open, balance]);
```

Un solo archivo, una adición de ~4 líneas.

