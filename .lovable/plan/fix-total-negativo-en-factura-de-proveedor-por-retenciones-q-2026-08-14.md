# Fix: Total negativo en factura de proveedor por retenciones que exceden la base

## Hallazgo (verificado)

El diff pegado no coincide con el código actual (usa nombres `useSupplierBillTotals`, `retentions`, `tax` que no existen), pero el bug que detecta **sí es real**.

Archivo: `src/features/accounts-payable/hooks/useSupplierBillForm.ts`

- **Línea 159** — cálculo del total SIN piso mínimo:
  ```ts
  const total = roundMoney(subtotal - discount + tax - retIva - retIsr);
  ```
  Cuando las retenciones (`retIva + retIsr`) superan `subtotal - discount + tax`, el total sale **negativo** y se envía a la BD.

- **Línea 44** — la guarda del schema usa la base equivocada:
  ```ts
  if (v.retention_iva + v.retention_isr > v.subtotal + v.tax_amount) { ... }
  ```
  Usa `subtotal + tax_amount`, pero el total real resta el `discount`. Con `discount > 0` el umbral de la guarda es más alto que la base real, así que **permite retenciones que producen total negativo**.

  Ejemplo: `subtotal=1000, discount=200, tax=0, retenciones=1000`
  - Guarda: `1000 > 1000+0` → `false` → **pasa** (debería fallar).
  - Total real: `1000 - 200 + 0 - 1000 = -200` → **negativo**.

## Cambios (adaptados al código real, no al diff pegado)

### 1. Corregir la guarda del schema (línea 44)
Usar la base gravable real (`subtotal - discount + tax_amount`) en lugar de `subtotal + tax_amount`:

```ts
if (v.retention_iva + v.retention_isr > v.subtotal - v.discount + v.tax_amount) {
  ctx.addIssue({
    code: "custom",
    path: ["retention_iva"],
    message: "Las retenciones (IVA + ISR) no pueden exceder la base gravable (subtotal − descuento + impuestos)",
  });
}
```

### 2. Piso defensivo en el cálculo del total (línea 159)
Añadir `Math.max(0, ...)` como defensa en profundidad (la guarda ya bloquea el caso, pero si los valores llegan por otra vía —p.ej. edición directa en BD o importación— el total no debe ser negativo):

```ts
const total = roundMoney(Math.max(0, subtotal - discount + tax - retIva - retIsr));
```

> No se duplica `const base` como en el diff pegado; aquí solo se aplica el piso al total.

## Verificación

- Typecheck + ESLint.
- Test de regresión nuevo: `supplierBillFormSchema` debe rechazar `retentions > subtotal - discount + tax` cuando `discount > 0`, y el cálculo de `total` nunca debe ser negativo.
- Changelog: entrada **patch** (v7.321.1).
