## Diagnóstico

Tienes razón: el badge "Sin Pagar" no aplica a cotizaciones — pertenece al dominio de facturas.

La causa es que `STATUS_LABELS` en `src/lib/constants.ts` mapea globalmente `sent → "Sin Pagar"` (pensado para facturas). Como las cotizaciones también usan el estado `sent` ("enviada al cliente"), el `<StatusBadge>` del header de detalle hereda ese texto incorrecto.

En el listado de cotizaciones ya existe un override local (`QUOTE_STATUS_LABELS` + `quoteLabel`) que lo corrige, pero **se olvidó aplicarlo en el header de detalle** (`QuoteHeaderBadges`), que es justo lo que ves ahora en `/quotes/:id`.

## Cambios

1. **`src/features/quotes/components/quotes/QuoteHeaderBadges.tsx`**
   - Importar `QUOTE_STATUS_LABELS` (ya existente).
   - Pasar `label={QUOTE_STATUS_LABELS[status] ?? status}` al `<StatusBadge>` para que `sent` se muestre como **"Enviada"** en lugar de "Sin Pagar". El color (azul info) se mantiene, sólo cambia el texto.

2. **Verificación de coherencia** (sin cambios funcionales adicionales):
   - Confirmar que el resto de `StatusBadge` en módulos no-facturación que usen `status="sent"` también pasen su label de dominio. Si encontramos otro huérfano lo corregimos igual.
   - No tocamos `STATUS_LABELS["sent"] = "Sin Pagar"` global porque sí es la etiqueta correcta para facturas.

3. **Changelog 6.13.10 (patch / bugfix)**
   - `public/changelog.json` + `public/changelog/v6.13.10.json`
   - Título: "Header de cotización ya no muestra 'Sin Pagar' (era etiqueta de factura)"

## Lo que NO cambia

- `StatusBadge` global, `STATUS_LABELS`, colores semánticos.
- Lógica de estado de cotizaciones, facturas, ni pagos.
- Listado de cotizaciones (ya estaba correcto).
