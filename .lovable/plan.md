

## Plan: Prefijo $ en campo de monto (type number)

### Cambios

1. **`src/pages/OperatingExpensesPage.tsx`**
   - Envolver el `<Input type="number">` en un `div relative` con un `<span>$</span>` posicionado a la izquierda
   - Agregar `className="pl-7"` al input para no solapar el símbolo
   - Cambiar placeholder a `"0.00"`

2. **`src/lib/changelog.ts`** — v3.14.1

