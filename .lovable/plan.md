## Objetivo
Eliminar las flechas (spinners) del navegador en los inputs de **Cantidad** y **Precio Unitario** de la tabla de líneas del modal "Nueva Nota de Crédito".

## Cambios propuestos

### 1. `src/features/invoices/components/invoice-detail/CreditNoteLinesTable.tsx`
- Agregar clases CSS para ocultar los spinners de `input type="number"` en los dos campos editables:
  - `[appearance:textfield]`
  - `[-moz-appearance:textfield]`
  - `[&::-webkit-outer-spin-button]:appearance-none`
  - `[&::-webkit-inner-spin-button]:appearance-none`
- Aplicarlas a los `<Input type="number">` de **Cantidad** y **Precio Unitario**.
- No modificar comportamiento, validación ni lógica de cálculo.

### 2. `public/changelog.json` y `public/changelog/v6.110.2.json`
- Agregar entrada de changelog `v6.110.2` describiendo el ajuste visual.

## Criterios de aceptación
- Los inputs de cantidad y precio unitario en el modal de Nueva Nota de Crédito no muestran flechas en Chrome, Edge, Safari ni Firefox.
- No se afectan otros inputs numéricos de la aplicación (según alcance confirmado).
- El build/typecheck pasa sin errores ni warnings.

## Notas
- El runtime error `409 Credit note already stamped or in progress` es un error de negocio del edge function de timbrado y no está relacionado con este ajuste visual. Si persiste, se recomienda revisar el flujo de timbrado en otro plan.