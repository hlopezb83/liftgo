# Limpiar la Bitácora de Cambios de registros de prueba y de movimientos del sistema

## Lo que encontré (consultado en la base de datos)

La Bitácora tiene **2,626 registros**. Revisándolos:

1. **26 registros son claramente de pruebas E2E**: son movimientos de mantenimiento con la marca de prueba (`is_e2e = true`) y un identificador de corrida tipo `w14-894830a1-c9je`, todos del 29 de julio. El disparador que escribe la bitácora ya intenta ignorar los datos de prueba, pero esa vez no los filtró.
2. **El filtro anti-pruebas tiene un hueco**: solo funciona en tablas que tienen la marca `is_e2e`. Diez tablas auditadas **no la tienen** (entregas, proveedores, gastos operativos, prospectos, contratos, facturas de proveedor, cuentas bancarias, líneas bancarias, inspecciones y configuración). Cualquier corrida de pruebas que las toque queda registrada como si fuera actividad real.
3. **Los movimientos masivos del sistema se ven como actividad de usuarios**: por ejemplo hoy hay 67 actualizaciones de pagos en el mismo segundo (fueron de un ajuste técnico de tipo de cambio), y 47 el 28 de julio. No traen usuario y hacen mucho ruido.
4. **No hay datos de prueba vivos** en flota, clientes, cotizaciones, reservas, facturas ni pagos: la limpieza de las pruebas sí borra los registros, pero la bitácora es "solo agregar" y sus rastros quedan.
5. Los registros cuyo documento original ya no existe (261, concentrados en febrero y marzo) **sí son borrados reales del negocio**, no basura de pruebas. No se tocan.

Analogía: la caja negra graba todo, incluidos los vuelos de simulador y los ajustes del mecánico. Falta etiquetar esas grabaciones para poder ocultarlas.

## Qué voy a hacer

1. **Etiquetar el origen de cada registro de la bitácora**: prueba, sistema (ajustes técnicos y procesos automáticos) o usuario.
2. **Cerrar el hueco del filtro**: cualquier movimiento hecho dentro de una sesión de pruebas queda marcado como prueba, aunque la tabla no tenga la marca propia.
3. **Marcar hacia atrás** los 26 registros de prueba ya existentes y los movimientos masivos sin usuario.
4. **Ocultar por defecto** los registros de prueba en la pantalla Bitácora de Cambios, con un filtro "Origen" (Todos / Usuarios / Sistema / Pruebas) para quien quiera verlos.
5. **Permitir borrarlos**: una acción de administrador que elimina únicamente los registros marcados como prueba, y que la limpieza automática de las pruebas la ejecute al terminar cada corrida para que no se vuelva a acumular.

## Detalle técnico

Migración:
- `public.audit_logs`: agregar `is_e2e boolean not null default false` y `source text not null default 'user'` (`user` | `system` | `e2e`), más índice parcial por `created_at desc where is_e2e = false`.
- `audit_trigger_fn()`: marcar `is_e2e` cuando la sesión sea de pruebas (`is_e2e_actor_email`, `app.e2e_seed = 'on'`, o payload con `is_e2e`/`e2e_scope`) aunque la tabla no tenga la columna; marcar `source = 'system'` cuando `auth.uid()` sea nulo o cuando `app.audit_source = 'system'`.
- Backfill: `is_e2e = true` en los 26 registros con `is_e2e` en el payload; `source = 'system'` en los registros sin `user_id`.
- `purge_e2e_audit_logs()`: `SECURITY DEFINER`, `SET search_path = public`, guard de rol admin, borra solo `is_e2e = true` usando una bandera de sesión que el trigger de inmutabilidad respeta (`enforce_audit_logs_immutable` se ajusta para permitir ese caso y solo ese). `REVOKE EXECUTE ... FROM anon`.
- `e2e_teardown()` y `e2e_purge_all()`: llamar al purgado al final.

Frontend:
- `src/features/audit/lib/queryKeys.ts`: la consulta excluye `is_e2e = true` salvo que el filtro lo pida.
- `AuditTrailPage.tsx`: nuevo facet `origen` en `useTableFilters` (por defecto "Usuarios y sistema").
- `useAuditTrailColumns.tsx`: etiqueta "Sistema" / "Prueba" junto al usuario.
- Pruebas unitarias del armado de filtros y de la etiqueta de origen.

Versión `v7.364.0` (minor) en `public/changelog.json` y `CHANGELOG.md`.

## Nota sobre lo que ya quedó listo

El arreglo de facturas ligadas a reservas (periodo de facturación autollenado y mensaje claro en lugar del error técnico) ya está implementado y probado como **v7.363.1**; solo falta publicar para que la app en producción deje de mostrar ese error.
