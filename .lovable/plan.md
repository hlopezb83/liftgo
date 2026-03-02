

## Reordenar las tarjetas del formulario de cotización

### Problema
Actualmente el orden de las tarjetas en el formulario no sigue un flujo lógico de trabajo. El usuario primero debería definir qué tipo de cotización es, luego para quién, después los detalles del equipo, costos adicionales, y finalmente notas.

### Nuevo orden

1. **Tipo de Cotización** (Renta / Venta)
2. **Cliente** (selector obligatorio)
3. **Detalles de Cotización** (periodo de renta, montacargas, IVA, válida hasta)
4. **Equipos a Cotizar** (solo visible en modo Venta)
5. **Incluir Servicio de Logística** (checkbox + monto)
6. **Resumen de Costos** (subtotal, IVA, total)
7. **Notas**
8. **Botones de acción** (Crear/Actualizar + Cancelar)

### Cambio técnico

- 1 archivo modificado: `src/pages/QuoteForm.tsx`
- Solo se reordena el JSX dentro del `<form>`, moviendo los bloques existentes sin modificar lógica ni estilos
- El bloque de `CustomerSelector` sube a la posición 2 (después del tipo)
- El bloque de `SaleLineItems` se mueve después de "Detalles de Cotización"
- Todo lo demás mantiene su estructura actual
