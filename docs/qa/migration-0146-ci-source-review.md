# Migración 0146: revisión de fuentes para CI aislado

Antecesora:0145 en `d0dda787b495dff06190eef784a46b183e6f831d`, árbol Drizzle
`a6d4f8c07af1f2f3997a9f631eb687540d944b8b`. Nuevo árbol
`e71152572b72f71a594fdff6328a2211bba5045e`.
Supabase permanece `3e3575f5ff6d509ecdd624ae7fc1772508b5dce6`.
Sólo se añade0146 y su entrada journal; los146 registros anteriores, SQL y
snapshots no cambian. No se añade snapshot porque no cambian tablas.

SQL `0146_maintenance_part_quantity.sql`, SHA256 canónico LF
`4f601870406b9bf08ee37fb555ad9a61ca605f0c26adc4cc310f1d3a9a515515`.
Journal idx146, tag `0146_maintenance_part_quantity`, when `1794542400003`,
version7, breakpoints true. Antecesora0145 when `1794542400002`, SHA256
`4db9b1d1c171a7549d7e36fe1117bedd0da194d9224067d2d406c88d8ec0bb9f`.

La instalación define `add_maintenance_part_quantity(uuid,uuid,integer)`, su ACL,
comentario y notificación de esquema. No hace DML de negocio, HTTP/cron, cambios
de políticas o de índices. SECURITY INVOKER, search_path pg_catalog/public;
EXECUTE authenticated, revocado PUBLIC/anon/service_role. Exige organización
interna, rol escritor y permiso Mantenimiento/full. Bloquea OT e inventario,
rechaza OT archivada/cerrada/cancelada, cantidad no positiva y stock insuficiente.
Una línea existente aumenta cantidad sin alterar cost_at_time, incluso cero;
una nueva toma costo del inventario bloqueado. El índice único y los triggers
existentes conservan la integridad del consumo y del total de la OT.

Cliente: contrato RPC local, recibo validado y scope de OT/refacción comprobado;
no envía importes. El formulario explica el costo capturado cuando corresponde.
El hook desactiva reintentos incluso ante configuración global, conserva errores
útiles de negocio/permisos y solicita recargar ante una respuesta incierta.
No se cambia el comportamiento de reintentos de otras mutaciones.

Evidencia aislada: replay de593 migraciones Supabase y Drizzle hasta0146,
excluyendo sólo los cuatro recibos ligados al destino que excluye CI. Infraestructura
auth/storage/realtime/cron simulada sin HTTP; tablas, helpers de autorización,
RLS y triggers de negocio provienen de migraciones reales. Suites SQL incluyen
costos cambiados/cero, límites, archivo/cierre, permisos y otra empresa.
Cinco carreras con sesiones authenticated verifican suma, rollback, última unidad,
archivo y cierre durante espera. No son pruebas de producción.

Integrar y verificar PR, aplicar0145 y0146 en ese orden por el canal autorizado
con preflight/ledger, verificar cuerpo/ACL y publicar. El frontend anterior sigue
compatible; el nuevo necesita0146 y falla visiblemente si falta. No se revierte
historial ni se elimina la función para volver al frontend anterior.
