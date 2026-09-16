# Tramo 8.1 · Rollout del folio REP por empresa

Estado: **no aprobado**. La migración no está aplicada en producción y no puede
aplicarse desde este entorno (ver "Bloqueo").

## Problema de rollout detectado

`supabase/functions/_shared/repFolio.ts` llama
`assign_stamped_rep_number(p_payment_id, p_folio, p_organization_id)`, pero
producción sólo tiene la firma de dos parámetros. Desplegar los Edge Functions
antes de aplicar la migración haría fallar la asignación de folio de **todos**
los complementos de pago justo después de timbrar ante el SAT. La versión
anterior del SQL propuesto además hacía `DROP` de la firma histórica, lo que
rompería cualquier caller aún desplegado.

## Rollout elegido: doble firma sin ventana de fallo

1. **Firma estricta** `assign_stamped_rep_number(uuid, text, uuid)`:
   `SECURITY DEFINER`, `search_path` fijo, autorización por rol antes de
   cualquier lectura privilegiada, organización leída de `public.payments`
   antes del `UPDATE` y condición `organization_id = v_payment_org` en el
   `UPDATE`. El parámetro de organización **sólo** sirve para rechazar cruces:
   nunca decide qué fila se actualiza.
2. **Wrapper de compatibilidad** `assign_stamped_rep_number(uuid, text)`: se
   **conserva** (no hay `DROP`) y delega en la estricta con `NULL::uuid`, sin
   argumento de organización. No actualiza `payments` por su cuenta, no acepta
   ni propaga organización del llamante y no permite sobreescribir un folio ya
   asignado (mismo folio = idempotente; folio distinto = `23505`).
3. **Respaldo en el código**: si la migración todavía no está aplicada, el
   helper detecta `PGRST202` / `42883` y reintenta con la firma histórica, en
   lugar de dejar un REP timbrado sin folio. Ese reintento no envía
   organización; la base la lee del propio pago.

Con (2) y (3) el orden de despliegue ya no puede romper los REP, pero el orden
correcto sigue siendo obligatorio:

```text
aplicar migración → verificar CI con base limpia → desplegar Edge Functions
```

## Verificación

- SQL revisable idéntico al que debe aplicarse:
  `docs/multiempresa/sql/0026_rep_number_org_scoped_assignment.sql`.
- Prueba de seguridad: `supabase/tests/rls/rep_folio_org_scope.sql`. **Falla**
  si la firma estricta no existe en el entorno donde corre; ya no usa `NOTICE`
  para volverse no-op. También verifica `SECURITY DEFINER`, `search_path`,
  lectura de la organización desde `payments`, condición de organización en el
  `UPDATE`, seguridad del wrapper y que `payments_rep_number_uidx` se conserve.
- Pruebas Deno del helper y del handler, incluidos los casos de firma faltante,
  reintento fallido, colisión, cruce de empresa e idempotencia.

## Índices

`payments_rep_number_uidx` (único global) **se conserva**. El Lote 2 de
unicidad por organización no se aplica en este tramo.

## Bloqueo

Este entorno no puede escribir en `supabase/migrations/` ni en
`drizzle/migrations/` (los gobierna el sistema de migraciones) y la única vía
disponible aplicaría el SQL directamente a producción, lo cual está prohibido
en este tramo. Por eso la migración se entrega como SQL revisable y **el tramo
8.1 no queda aprobado**: falta aplicarla por el canal de migraciones y ver la
suite RLS en verde con base limpia, con `rep_folio_org_scope.sql` incluida.
Mientras la migración no esté en el repositorio, esa prueba fallará en CI, que
es exactamente la señal pedida.
