# Migración 0145: revisión de fuentes para CI aislado

Base `aa1fc1233`; árbol Drizzle anterior `ef9d72b05a227a0bdc50bd68632cc89f802f78e7`.
Nuevo árbol `a6d4f8c07af1f2f3997a9f631eb687540d944b8b`.
Supabase permanece en `3e3575f5ff6d509ecdd624ae7fc1772508b5dce6`.

Sólo se añade `0145_archived_maintenance_children.sql` y journal idx145,
tag `0145_archived_maintenance_children`, when `1794542400002`, version7,
breakpoints true. Las145 entradas anteriores, SQL y snapshots no cambian.
No se necesita snapshot nuevo: no hay cambios de tablas.
SHA256 del SQL canónico LF:
`4db9b1d1c171a7549d7e36fe1117bedd0da194d9224067d2d406c88d8ec0bb9f`.
Antecesora0144, when `1794542400001`, SHA256
`93f91bd0a0b7f34370aaec88fa6436ef850b57ceaa7dfcb931d88e1db96f266e`.

La instalación sustituye únicamente el cuerpo del guard de hijos de mantenimiento
y conserva su SECURITY DEFINER/search_path y revocaciones. Los triggers existentes
siguen bloqueando ambos padres en orden de UUID; ahora también rechazan deleted_at
no nulo antes de cualquier consumo o recálculo. Se conserva el bloqueo de completed
y cancelled. No modifica históricos, stock, políticas, RPC de archivo/restauración,
HTTP o cron. No introduce una bandera para saltar la regla.

El pin de CI se actualiza tras revisar este delta; la lógica y exclusiones del
replay permanecen intactas. Las pruebas fijan SQL/journal y rechazan el árbol previo.
La suite RLS archived_maintenance_children.sql prueba altas/cambios/bajas y traslados
de partes/mano de obra, preservación de importes/stock, restauración, órdenes cerradas
y acceso entre empresas/lector sobre el esquema migrado. Toda evidencia local es
sintética; no certifica aplicación en producción.

Orden: integrar y verificar PR, aplicar0145 por el canal autorizado de migraciones
con preflight/ledger y verificar función antes de publicar. Es compatible con el
cliente anterior: una pestaña obsoleta recibe el error y no cambia el negocio.
