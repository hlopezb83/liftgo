# Corregir error "Las partidas no cuadran con el subtotal" al crear cotizaciones

## Qué pasó

Al guardar una cotización con descuentos en **porcentaje**, la base de datos rechaza el registro:

```text
suma de partidas (1,164,524.00) <> subtotal (1,129,594.10)
```

La app calcula bien: aplica el descuento como porcentaje (≈3%) y llega a 1,129,594.10.
La validación de la base de datos lee el mismo campo `discount` pero **siempre lo interpreta como pesos**, ignorando el campo `discount_type` ("%" o "$"). Con un 3% de descuento resta literalmente $3, así que su suma queda casi igual al bruto y no coincide con el subtotal.

Analogía: es como un cajero que ve la etiqueta "3" en el cupón y descuenta 3 pesos, cuando el cupón decía 3 por ciento. La caja no cuadra, pero el error está en el cajero, no en el ticket.

Confirmado leyendo la función `validate_invoice_line_items_signs()` en la base de datos: hace `v_sum := v_sum + round(amount - discount, 2)` sin mirar `discount_type`. Este mismo disparador está activo en **cotizaciones y facturas**, así que el problema aplica a ambos.

Nota: el texto que ve el usuario ("No se pudo generar un folio disponible…") es un mensaje genérico equivocado; el problema real no tiene nada que ver con folios.

## Qué se va a hacer

1. **Migración de base de datos**: actualizar `validate_invoice_line_items_signs()` para que calcule el descuento igual que la app:
   - si `discount_type` = `"%"` (o viene vacío, que es el valor por omisión de la app), descontar el porcentaje sobre el importe de la partida, tope 100%;
   - si `discount_type` = `"$"`, descontar el monto fijo;
   - nunca dejar la partida en negativo (piso en 0), igual que `applyDiscountToBase` en el frontend;
   - conservar el resto de las validaciones (cantidad > 0, precio ≥ 0, descuento ≥ 0, tolerancia 0.05).
2. **Mensaje de error correcto**: en el flujo de guardado de cotizaciones, dejar de mostrar el texto de "folio desincronizado" para errores que no son de folio, y mostrar el mensaje real de la base de datos.
3. **Pruebas**: agregar caso de prueba de que un descuento porcentual pasa la validación (verificación vía SQL contra la base de datos) y prueba unitaria del mapeo de errores del formulario de cotizaciones.
4. **Changelog**: nueva entrada `v7.279.4` (patch) en `public/changelog.json` y `public/changelog/v7.279.4.json`, más alineación de `package.json` y `public/version.json`.

## Detalle técnico

- Función afectada: `public.validate_invoice_line_items_signs()` (triggers `trg_quotes_positive_line_amounts`, `trg_invoices_positive_line_amounts`, `trg_validate_invoice_line_items_signs`).
- Fuente de verdad en el frontend a replicar: `applyDiscountToBase` en `src/lib/domain/invoiceTotals.ts` (currency.js, precisión 2).
- Cálculo por partida en SQL: `base := round(amount, 2)`; si `discount_type = '$'` → `greatest(0, base - discount)`; en otro caso → `greatest(0, base - round(base * least(discount,100) / 100, 2))`.
- No se cambia el esquema de tablas ni el formato de `line_items`; solo la lógica de validación.
