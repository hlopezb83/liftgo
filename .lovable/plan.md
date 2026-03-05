

## Formatear monto en el diálogo de Registrar Pago

### Cambio

**Archivo: `src/components/RecordPaymentDialog.tsx`**

El campo "Monto" muestra el balance como número plano (ej. `1234.50`). Se formateará con el formato de moneda mexicana usando `formatCurrency` como texto de ayuda o placeholder, y se mostrará el símbolo `$` como prefijo del input.

- Agregar el símbolo `$` como prefijo visual al input de monto (usando un wrapper con texto antes del input o un placeholder con formato)
- Mostrar el balance formateado debajo del campo como referencia: "Saldo pendiente: $1,234.50"
- Importar `formatCurrency` desde `@/lib/formatCurrency`

