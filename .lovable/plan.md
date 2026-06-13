## Diagnóstico

Los logs de CI muestran **todos los jobs en verde** (E2E shard 1: 24/24, shard 2: 24/24, RLS: 33/33, Lint/Knip/Tests/Build OK, Edge Functions OK).

Hay **un único warning real**, no fatal, en `0_E2E (Playwright shard 1_2).txt` línea 515:

```
[e2e] teardown falló para scope=w1-921d6224-h8al:
  Error: [e2e_teardown:w1-921d6224-h8al] update or delete on table "invoices"
  violates foreign key constraint "payments_invoice_id_fkey" on table "payments"
```

### Causa raíz

`invoice-payment.spec.ts` crea un pago **a través del flujo real de la app** (`useCreatePayment` → `INSERT INTO payments`). Ese insert **no marca** `is_e2e = true` ni copia `e2e_scope`, porque el código de producción no conoce esas banderas.

La RPC `e2e_teardown` (migración `20260612224924`) borra los pagos así:

```sql
DELETE FROM public.payments WHERE is_e2e = true AND (
  e2e_scope = p_scope
  OR invoice_id IN (SELECT id FROM public.invoices WHERE is_e2e = true AND e2e_scope = p_scope)
);
```

El filtro `is_e2e = true` excluye al pago creado por la app, por lo que queda huérfano y el `DELETE FROM invoices` siguiente revienta con la FK `payments_invoice_id_fkey`.

Hoy el error solo se loguea (`teardownScenario(...).catch(...)` en `seed.ts:112`), así que **no tumba CI**, pero deja basura en la BD demo (factura pagada + pago sin `is_e2e`), exactamente el bug que motivó originalmente la limpieza estricta del Estado de Resultados (v6.47.1).

## Cambio propuesto

Una migración mínima que reemplace `public.e2e_teardown` y, en el `DELETE` de `payments`, **elimine la guardia `is_e2e = true` cuando el pago referencia una factura E2E** (la propia factura ya está marcada `is_e2e = true AND e2e_scope = p_scope`, eso es prueba suficiente).

Resto de la función queda igual.

### SQL (técnico)

```sql
CREATE OR REPLACE FUNCTION public.e2e_teardown(p_scope text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
...
  DELETE FROM public.payments
   WHERE (is_e2e = true AND e2e_scope = p_scope)
      OR invoice_id IN (
           SELECT id FROM public.invoices
            WHERE is_e2e = true AND e2e_scope = p_scope
         );
...
$function$;
```

(El resto del cuerpo se conserva tal cual.)

## Verificación

- Re-correr `bunx playwright test invoice-payment.spec.ts` localmente; el log `[e2e] teardown falló` debe desaparecer.
- Confirmar que `e2e_teardown` siga restringido a `admin` (la guardia `has_role` se mantiene).

## Changelog

Entrada `v6.66.17` patch, categoría `testing` / `infra`:
- Detalle: "Teardown E2E ahora elimina pagos creados por flujos reales de la app que referencian facturas sembradas (antes el filtro `is_e2e=true` los dejaba huérfanos y disparaba FK en `invoices`)."

## Fuera de alcance

- No tocar `seed.ts` ni los specs Playwright (el bug está en el SQL).
- No cambiar el comportamiento de `useCreatePayment` (sería contaminar código de producción con banderas E2E).
- No tocar otras tablas hijas; el log solo muestra `payments` como reincidente.
