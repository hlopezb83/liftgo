# Migración 0143: revisión de fuentes para CI aislado

Base: `origin/main` `5f5daf6488def6eb887f9d6bfdc8a15a1f8a9efb`.
El árbol Drizzle anterior es `214482342a44fa8c79ce7092454b463035319e3b`;
el nuevo árbol revisado es `b335ac252ed357de4487da78d951d36ee2503c63`.
Supabase permanece en `3e3575f5ff6d509ecdd624ae7fc1772508b5dce6`.

El delta contiene únicamente `0143_contract_deposit_concurrency.sql` y la
entrada 143 del journal. Los 143 registros anteriores y todos los SQL/snapshots
anteriores son idénticos a la base. No se añade snapshot de esquema porque no
hay cambio de tablas. SQL canónico LF SHA256:
`25cb5062c9bbd4c1b5f49c6c1b57730c6ad396a7fc25e1573a1fbeb3373fcae1`.

Identidad del journal: idx `143`, tag `0143_contract_deposit_concurrency`,
when `1794542400000`, version `7`, breakpoints `true`. Antecesora: idx `142`,
tag `0142_0142_inventory_low_stock_filter`, when `1794524319237`.

La función nueva comprueba rol y revisión obligatoria, bloquea la fila bajo RLS
y rechaza una revisión obsoleta antes del no-op/UPDATE. Conserva importes
parciales y fechas; confirma el depósito y su revisión. La firma anterior sólo
lanza un error de recarga, sin escribir. Ambas son SECURITY INVOKER con
`search_path=public`; EXECUTE se concede a authenticated y se revoca a PUBLIC,
anon y service_role. La instalación define funciones, ACL, comentarios y
notifica la caché de esquema de PostgREST; no ejecuta DML de negocio, HTTP ni cron.

El cambio del guard se limita a este pin exacto. No cambia sus controles ni
exclusiones. Las pruebas fijan SQL/journal, rechazan el árbol previo y comprueban
el rechazo de modificaciones locales de 0143 antes de cualquier parcheo.
La validación usa bytes Git LF en una copia aislada; CRLF locales de Windows no
son una identidad alternativa aceptada. Esto no certifica aplicación productiva.
