## Objetivo
Que la próxima factura que se cree tenga el número **FAC-0057** (actualmente la siguiente sería FAC-0053, ya que la última emitida es FAC-0052).

## Contexto
La numeración la genera la función `next_invoice_number()` en la base de datos, que toma el máximo número existente en `invoices.invoice_number` y le suma 1. No hay una tabla de configuración para "saltar" folios.

## Enfoque propuesto
Crear una pequeña tabla de configuración para el folio mínimo siguiente y actualizar la función `next_invoice_number()` para que use el mayor entre `max(invoice_number)+1` y ese mínimo configurado. Así podemos reservar saltos sin crear facturas falsas (que ensuciarían reportes, P&L, auditoría y SAT).

### Cambios en BD (migración)
1. Crear tabla `invoice_number_settings` con una sola fila:
   - `id` (uuid PK)
   - `min_next_number` int not null default 1
   - `updated_at` timestamptz
   - RLS: solo `admin` y `administrativo` pueden leer/escribir.
2. Insertar la fila inicial con `min_next_number = 57`.
3. Reemplazar `next_invoice_number()` por:
   ```sql
   SELECT 'FAC-' || lpad(
     GREATEST(
       coalesce(max(nullif(regexp_replace(invoice_number,'[^0-9]','','g'),'')::int),0) + 1,
       (SELECT min_next_number FROM invoice_number_settings LIMIT 1)
     )::text, 4, '0')
   FROM invoices;
   ```
   Mantiene `SET search_path = public` y `SECURITY` actuales.

### Resultado inmediato
- La siguiente factura creada (manual o por el job de recurrentes) será **FAC-0057**.
- Las posteriores seguirán normalmente: FAC-0058, FAC-0059, etc.
- El salto (0053–0056) queda documentado en la tabla de configuración por si auditoría pregunta.

### UI (opcional, no incluido en este cambio)
No se agrega UI ahora. Si más adelante quieres poder saltar folios desde la app, se puede agregar un campo "Próximo folio mínimo" en **Configuración → Facturación**.

### Changelog
- Nueva entrada `v5.59.3` (patch): "Reservar siguiente folio de factura en FAC-0057".

## Notas
- No se crean facturas dummy; el SAT y los reportes no se ven afectados.
- Si en el futuro quieres reiniciar o volver a saltar, basta con un `UPDATE invoice_number_settings SET min_next_number = N`.
