## Causa raíz (confirmada, no es hipótesis)

Reproduje el error contra la base real: **PostgREST rechaza cualquier filtro `or=(...)` en un UPDATE**, con el error `42703: column payments.rep_cfdi_status does not exist` (la columna sí existe; falla al armar la consulta). Pruebas:

```text
PATCH /payments?id=eq.X&rep_cfdi_status=eq.pending      -> OK  []
PATCH /payments?id=eq.X&or=(a.eq.1,b.eq.2)              -> 42703 "column ... does not exist"
PATCH /maintenance_policies?...&or=(...)                -> 42703 (mismo patrón)
```

Analogía: el candado no estaba "ocupado"; la llave estaba mal cortada y ni siquiera entraba en la cerradura. Como el código solo miraba "¿se abrió o no?", siempre reportaba "ocupado".

Esto explica también el reporte original de ayer (FAC-0091): el claim nunca corrió, por eso no había rastro en la bitácora ni cambio de estado. El v7.248.1 mejoró el mensaje (por eso hoy vemos la causa real) pero no arregló la operación.

## Alcance: dos lugares afectados

1. `supabase/functions/stamp-payment-complement/index.ts` — el claim atómico del REP nunca funciona: **ningún REP se puede timbrar**.
2. `supabase/functions/generate-recurring-maintenance/index.ts` — el claim por póliza también falla; hoy no hay pólizas activas (0 registros), así que no hay impacto visible, pero quedaría roto al activar la primera.

El resto de `.or()` del proyecto está en SELECT, que sí es válido.

## Cambios propuestos

### 1. RPC de claim para el REP (migración)

Nueva función `claim_payment_rep_stamping(p_payment_id uuid, p_stale_minutes int default 5)`:
- Un solo `UPDATE ... WHERE id = p_payment_id AND (condición OR completa)` en SQL, atómico, con `SECURITY DEFINER` y `SET search_path = public`.
- Condición: estados `pending|error|none` con UUID nulo, o `cancelled`, o `stamping` con UUID nulo y claim vencido (> N minutos).
- Devuelve el estado resultante: `claimed` (éxito) o el `rep_cfdi_status` actual cuando no se pudo reclamar, para seguir dando mensajes específicos.
- Permisos restringidos a los roles que ya pueden timbrar (admin/administrativo) y a `service_role`.

### 2. Edge function `stamp-payment-complement`

- Sustituir el `.update().or()` por la llamada al RPC.
- Mantener el manejo actual de errores: error de base → 503 con causa real; rechazo legítimo → 409 con el mensaje de `claimRejectionMessage(status)`.
- Se conserva `rep_stamping_started_at` y la liberación de claims (`releaseClaim`).

### 3. Edge function `generate-recurring-maintenance`

- Reemplazar el `.update().or()` por un claim equivalente sin OR: filtrar por `last_generated_month.lt.<mes>` y, en un segundo intento, por `last_generated_month.is.null`, o bien un RPC `claim_maintenance_policy_month` análogo (preferido, una sola sentencia atómica).

### 4. Guardarraíl para que no vuelva a pasar

- Comentario/regla en el helper compartido de edge functions y una prueba unitaria que documente que `.or()` no es válido en mutaciones (los claims deben ir por RPC).
- Prueba de `decisions.ts` para el nuevo mapeo estado → mensaje del RPC.

### 5. Validación

- Reintentar el timbrado del REP del pago de FAC-0091 en preview y revisar los logs de la función.
- `deno fmt --check`, tests unitarios y typecheck.
- Entrada de changelog v7.248.2 en `public/changelog.json` + `public/changelog/v7.248.2.json`.

## Detalles técnicos

- Archivos: migración nueva; `supabase/functions/stamp-payment-complement/index.ts`; `supabase/functions/generate-recurring-maintenance/index.ts`; `supabase/functions/stamp-payment-complement/decisions.ts` (+ test).
- No se toca la lógica de Facturapi ni `prepare_payment_complement`.
- La atomicidad se conserva: el claim sigue siendo un único UPDATE condicional, solo que ejecutado en SQL en vez de armado por PostgREST.
