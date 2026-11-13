# Migración 0147: revisión de fuentes para CI aislado

Base funcional0146: árbol Drizzle `e71152572b72f71a594fdff6328a2211bba5045e`.
La integración del commit de UX `02adfc7411d53c3ae5362fb68b43b1218fd58bcc`
conserva0145 y0146 y produce el árbol
`516f3b388f1bc955828b7486c2918b51b65eab0e`.
Supabase permanece `3e3575f5ff6d509ecdd624ae7fc1772508b5dce6`.

El delta añade sólo `0147_maintenance_stock_options.sql` y journal idx147,
tag `0147_maintenance_stock_options`, when `1794542400004`, version7,
breakpoints true. Las147 entradas anteriores y todos los SQL/snapshots previos
se conservan. No se añade snapshot: no hay cambios de tablas.
SHA256 canónico LF:
`cb7af2b2b6bd3232424f4e2bafd1ccaa5e26205874a0fa7fd5309a1d3f0cbb58`.
Antecesora0146, when `1794542400003`, SHA256
`4f601870406b9bf08ee37fb555ad9a61ca605f0c26adc4cc310f1d3a9a515515`.

La instalación define una sobrecarga de get_inventory_page con ocho argumentos
y convierte la entrada existente de siete argumentos en un wrapper compatible.
Ambas conservan SECURITY INVOKER/STABLE y search_path pg_catalog/public;
EXECUTE authenticated, revocado PUBLIC/anon/service_role. La organización proviene
de la sesión y el identificador esperado sólo la verifica. El modo de mantenimiento
exige Mantenimiento/full y limita a existencias positivas antes de count/paginación.
El modo general conserva Refacciones/read o full. RLS sigue vigente; el orden usa
una lista explícita de columnas y desempate estable. Los argumentos de modo son
obligatorios para evitar ambigüedad con las entradas de seis y siete argumentos.
No altera políticas, inventario, costos ni documentos; no ejecuta DML de negocio,
HTTP o cron. Los bytes de0142,0145 y0146 no cambian.

El guard canónico sólo actualiza el pin y sus comentarios; no cambia lógica,
exclusiones ni destinos permitidos. Las pruebas fijan SQL/journal, rechazan el
árbol previo y prueban que un cambio local de0147 se detecta antes del parcheo.

Validación funcional previamente ejecutada en PostgreSQL17 local: la suite
maintenance_stock_options.sql pasó después del replay de593 migraciones Supabase
y Drizzle hasta0146, seguido del mismo SQL0147. Usó tablas, helpers y RLS reales;
sólo la infraestructura de plataforma era sintética y sin HTTP. Incluyó mecánico
sin acceso a Refacciones, búsqueda fuera de la primera página, conteo antes del
rango, otra empresa y permiso de mantenimiento insuficiente. Esta evidencia no
certifica aplicación productiva ni reemplaza la validación de identidad de CI.

Orden: integrar/verificar PR, aplicar0145→0146→0147 por el canal autorizado con
preflight/ledger y verificar firmas/ACL antes de publicar. Los clientes anteriores
conservan sus entradas de inventario; el selector nuevo necesita0147. Revertir el
frontend no exige eliminar funciones ni modificar el historial aplicado.
