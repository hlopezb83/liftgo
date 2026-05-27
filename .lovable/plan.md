# Reservar siguiente folio de factura en FAC-0060

## Cambio
Actualizar `min_next_number = 60` en la tabla `invoice_number_settings`. La función `next_invoice_number` (que usa `GREATEST(max+1, min_next_number)`) emitirá la próxima factura como **FAC-0060**, saltando cualquier folio menor sin crear facturas falsas.

## Pasos
1. **Migración SQL**
   ```sql
   UPDATE public.invoice_number_settings SET min_next_number = 60;
   ```
2. **Changelog** (último paso obligatorio)
   - `public/changelog.json`: nueva entrada `6.13.4` (patch, improvement).
   - `public/changelog/v6.13.4.json`: detalle "Folio mínimo de factura ajustado a FAC-0060".

## Fuera de alcance
- No se modifica la función `next_invoice_number` ni el esquema.
- No se crean facturas placeholder.

## Verificación
- `SELECT public.next_invoice_number();` debe devolver `FAC-0060` (asumiendo que el máximo actual es menor a 60).
