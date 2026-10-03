# Facturación recurrente: falla por "contexto de organización" en folios

## Causa (confirmada en código y logs)
- La función de generación guarda la factura con el acceso de servicio (sin usuario), llamando a `create_recurring_invoice`.
- Esa operación sí deduce la empresa a partir de la reserva, pero no la "anuncia" a la base antes de insertar la factura.
- Al insertar, la regla que asigna el folio busca la empresa: no hay usuario ni `app.organization_id`, y como ya existen 2 empresas activas, rechaza (código 23514). Con una sola empresa funcionaba por compatibilidad temporal; por eso apareció al dar de alta la segunda.

Analogía: el cajero sabe de qué sucursal es el ticket, pero no se lo dice a la impresora de folios; mientras había una sola sucursal la impresora adivinaba, ahora con dos se niega.

## Cambio propuesto
1. Nueva migración (aplicada por ti vía Git, no la ejecuto en producción): redefinir `create_recurring_invoice` para que, tras determinar y validar la empresa de las reservas, ejecute `set_config('app.organization_id', <empresa>, true)` (sólo dentro de la transacción) antes de insertar la factura. Resto de la lógica sin cambios.
2. Prueba SQL de regresión en `supabase/tests/rls/` con dos empresas activas: generar una factura recurrente como servicio asigna folio de la empresa correcta y no mezcla empresas.
3. Revisar otras operaciones de servicio que insertan documentos con folio (p. ej. facturas por daños, notas de crédito desde funciones) y listar las que tengan el mismo hueco, para corregirlas en la misma migración si aplica.
4. Changelogs (patch).

## Detalles técnicos
- Archivo base: `drizzle/migrations/0075_recurring_group_collision_guard.sql` (última definición). `v_org` ya existe ahí; agregar `PERFORM set_config(...)` antes del `INSERT INTO public.invoices`.
- Sin cambios en la función de borde; no se escriben datos de producción durante pruebas.
