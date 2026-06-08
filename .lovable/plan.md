# Tanda 4 de Seguridad — Cierre de hallazgos pendientes

## Objetivo

Cerrar los 2 hallazgos abiertos del scanner de Lovable Cloud y reducir el ruido del Supabase Linter revocando EXECUTE de funciones `SECURITY DEFINER` que no necesitan estar expuestas a todo el rol `authenticated`.

Sin cambios funcionales para el usuario final. Todo es endurecimiento de backend.

---

## Lote A — Bucket `cfdi-files` (storage.objects)

**Hallazgo:** el bucket tiene solo política de `SELECT` para admin/administrativo, pero ninguna política de `INSERT`, `UPDATE` ni `DELETE`. Hoy las edge functions (`stamp-cfdi`, `cancel-cfdi`) suben/borran vía `service_role`, así que funciona — pero queda implícito y el scanner lo marca.

**Acción (migración):**
- Añadir políticas explícitas `INSERT`, `UPDATE`, `DELETE` en `storage.objects` para el bucket `cfdi-files`, restringidas a `admin` y `administrativo` vía `has_role(auth.uid(), ...)`.
- Service role sigue funcionando (bypassa RLS), no rompe nada.

**Decisión sobre `invoices` SELECT para `customer`:** se marca como **aceptado por diseño** en `security-memory`. Los clientes del portal leen sus facturas vía RPCs (`get_customer_invoices`, etc.) con validación de propiedad, no por Data API directa. No se añade política.

---

## Lote B — Revocar EXECUTE de `SECURITY DEFINER` no necesarias en `authenticated`

**Hallazgo:** 35 warnings del linter `0029`. Ya en `v6.13.0` revocamos `anon`/`PUBLIC`. Falta auditar cuáles funciones realmente necesitan ser invocables por todo `authenticated` (incluye `customer` del portal) vs solo por roles internos.

**Plan:**
1. Listar todas las funciones `SECURITY DEFINER` del schema `public` y agruparlas en 3 categorías:
   - **Públicas a authenticated** (mantienen EXECUTE): `has_role`, `get_public_branding`, RPCs del portal de clientes (`get_customer_*`).
   - **Solo personal interno** (REVOKE de `authenticated`, GRANT específico a roles internos vía función wrapper o se confía en el `has_role` interno): RPCs de dashboard, reportes, CFDI, gestión de usuarios, audit revert, etc.
   - **Solo `service_role`**: RPCs invocadas exclusivamente desde edge functions con cron (ej. `generate_recurring_*`).

2. Migración con bloque de `REVOKE EXECUTE ... FROM authenticated` + `GRANT EXECUTE ... TO service_role` donde aplique.

**Defense-in-depth:** todas las funciones conservan su `has_role()` interno como segunda capa. La revocación es para silenciar al linter y reducir superficie.

**Nota de aceptación:** las funciones que sigan siendo callable por `authenticated` con guarda `has_role` interno se documentan en `security-memory` como postura aceptada (ya hay precedente en `v6.13.0`).

---

## Entregables

1. **Migración SQL** con políticas storage + REVOKE/GRANT consolidados.
2. **Actualizar `security-memory`** con la nueva postura aceptada (invoices customer SELECT vía RPC, funciones authenticated con `has_role` interno).
3. **Re-ejecutar scanner + linter** para confirmar cierre.
4. **Changelog** `v6.14.0` (minor, category: security) con detalle de cambios.
5. **Marcar fixed** los 2 findings del scanner vía `manage_security_finding`.

---

## Detalles técnicos

- Las políticas de `storage.objects` se filtran por `bucket_id = 'cfdi-files'` y `has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)`.
- Para el lote B, antes de la migración, exploraré con `supabase--read_query` sobre `pg_proc` + `information_schema.routine_privileges` para inventariar las 35 funciones y clasificarlas. Esto genera el SQL definitivo del REVOKE.
- No se tocan funciones del portal de cliente (`get_customer_*`) — siguen accesibles a `authenticated` porque ahí están los clientes.

---

## Riesgos y mitigación

- **Riesgo:** revocar EXECUTE rompe alguna llamada del frontend.
  - **Mitigación:** clasificación previa basada en uso real (`rg` por nombre de función en `src/`). Cualquier RPC llamada desde el portal de cliente queda en grupo 1.
- **Riesgo:** edge functions con cron pierden acceso.
  - **Mitigación:** `service_role` bypassa todo; además se añade GRANT explícito a `service_role` por claridad.

---

## Fuera de alcance

- Paginación server-side de invoices/bookings (auditoría de rendimiento, paso 9).
- Virtualización del Gantt (paso 10).
- Migración de `dompurify` o `@hello-pangea/dnd` (auditoría de dependencias, sin urgencia).
