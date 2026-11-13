# Migración 0144: revisión de fuentes para CI aislado

Base funcional: D2 `2449eb673ade86605c541e2dc694c01fd966991b`
(misma migración 0143 incorporada sobre `35c7e7b3124f3a182c3ae27615d018d696244605`).
Árbol Drizzle previo `b335ac252ed357de4487da78d951d36ee2503c63`;
nuevo árbol revisado `ef9d72b05a227a0bdc50bd68632cc89f802f78e7`.
Supabase permanece en `3e3575f5ff6d509ecdd624ae7fc1772508b5dce6`.

El delta añade únicamente `0144_deliveries_server_page.sql` y la entrada 144
del journal. Los 144 registros previos y todos los SQL/snapshots anteriores
permanecen idénticos. No se añade snapshot porque no hay cambios de tablas.
SQL canónico LF SHA256:
`93f91bd0a0b7f34370aaec88fa6436ef850b57ceaa7dfcb931d88e1db96f266e`.

Journal: idx `144`, tag `0144_deliveries_server_page`,
when `1794542400001`, version `7`, breakpoints `true`.
Antecesora: idx `143`, tag `0143_contract_deposit_concurrency`,
when `1794542400000`; SHA256
`25cb5062c9bbd4c1b5f49c6c1b57730c6ad396a7fc25e1573a1fbeb3373fcae1`.

La instalación sólo define `get_deliveries_page`, limita sus ACL y notifica
PostgREST. SECURITY INVOKER/STABLE, `search_path=pg_catalog,public`; EXECUTE
a authenticated, revocado a PUBLIC/anon/service_role. Conserva RLS, comprueba
sesión, organización y permiso efectivo de Entregas. Filtra búsqueda, tipo,
estado y conciliación antes del total/página; desempata con fecha/id. El DTO
omite firmas. El contador de atrasados no depende de los filtros y excluye
conciliaciones vigentes. 0141 y su vista/RPC específica permanecen intactas.
No ejecuta DML de negocio, HTTP/cron ni cambios de políticas.

El pin exacto de CI se actualiza tras esta revisión, sin cambiar lógica ni
exclusiones. Las pruebas fijan SQL/journal y rechazan el árbol anterior y
modificaciones locales de 0144 antes del parcheo. La identidad usa bytes Git
LF en una copia aislada, nunca CRLF locales como alternativa.

Orden: integrar y verificar PR, aplicar 0143 antes de 0144 por el canal de
migraciones autorizado de Lovable con preflight/ledger, comprobar firma/ACL
y publicar el frontend. Clientes anteriores continúan con sus consultas
existentes; el frontend nuevo requiere la RPC y muestra error/reintento si
falta. Volver al frontend previo no exige borrar la función ni alterar ledger.
Esta revisión y las pruebas sintéticas no certifican aplicación productiva.
