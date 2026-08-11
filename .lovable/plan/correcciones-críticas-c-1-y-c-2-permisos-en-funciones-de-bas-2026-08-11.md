# Correcciones críticas C-1 y C-2: permisos en funciones de base de datos

## Qué encontré (verificado contra la base de datos actual)

Ambos hallazgos del archivo subido son bugs reales:

- **C-1 · `create_recurring_invoice`**: es SECURITY DEFINER (corre con permisos de superusuario) y su cuerpo actual no verifica ningún rol. Cualquier usuario autenticado —incluido un cliente del portal— podría crear facturas.
- **C-2 · `change_forklift_status`**: mismo caso; cualquier usuario autenticado podría marcar un montacargas como vendido o retirado.
- **Agravante no mencionado en el archivo**: hoy ambas funciones tienen permiso de ejecución también para `anon` (visitantes sin sesión), no solo para `authenticated`.

Diferencia importante con el diff propuesto: el cuerpo real de `change_forklift_status` en la base usa un conteo de reservas confirmadas, no `has_active_rental()` como asume el diff. Si aplicara el diff tal cual, cambiaría la lógica de negocio además del permiso.

## Qué haré

Una sola migración que **conserva el cuerpo vigente de cada función tal como está hoy en la base** y únicamente agrega el control de acceso:

1. `create_recurring_invoice`: permitir solo `admin` y `administrativo`, más `service_role` (lo usa el proceso automático de facturación recurrente, que no tiene usuario). Cualquier otro caso: error `42501 not authorized`.
2. `change_forklift_status`: permitir solo `admin`, `administrativo` y `mechanic` (los roles que hoy pueden operar Flota/Mantenimiento desde la app).
3. Quitar el permiso de ejecución a `anon` en ambas funciones y dejar explícitos los GRANT correctos.

## Verificación

- Prueba SQL nueva en `supabase/tests/c1_c2_smoke.sql`: confirma que ambas funciones ya no tienen EXECUTE para `anon`, que su código contiene el guard de rol y que el flujo de admin sigue funcionando.
- Correr la suite de pruebas existente (los tests de `useForkliftMutations` y de facturación recurrente cubren los caminos felices).

## Detalle técnico

- Migración: `CREATE OR REPLACE FUNCTION` con el cuerpo actual extraído de `pg_get_functiondef`, insertando el bloque guard al inicio del `BEGIN`.
- Guard C-1: `COALESCE(auth.jwt() ->> 'role','') <> 'service_role' AND NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'administrativo'))`.
- Guard C-2: `NOT (has_role(...,'admin') OR has_role(...,'administrativo') OR has_role(...,'mechanic'))`.
- `REVOKE ALL ... FROM PUBLIC, anon;` seguido de los `GRANT EXECUTE` explícitos.
- No se toca el frontend; los mensajes de error ya se manejan globalmente vía `notifyError`.

## Cierre

Al final: entrada nueva en `public/changelog.json` + `public/changelog/v7.289.0.json` y bump de versión (minor: cambio de seguridad sin romper contratos).
