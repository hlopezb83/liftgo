# Reconciliación local de PR 284 con main

Head anterior de 284: `988803bcb7247674ad0c1ca2f5c28eb084f34105`.
Main incorporado: `0a532d68f0458b96b6e5a8e9f32900322056775f`, que integra
282, 285 y 286. La integración se hizo en un worktree aislado mediante merge
local `--no-commit`; el árbol inicial estaba limpio. No se fusionó el PR en
GitHub ni se publicó una rama, aplicación, Edge o migración.

## Resolución y preservación de bytes

El único conflicto fue `drizzle/migrations/meta/_journal.json`. El prefijo de
main hasta 0105 era idéntico al de 284. Se conservó el journal completo anterior
de 284: ese mismo prefijo, seguido de una única entrada 0106. No se editó SQL,
se duplicó 0105 ni se reordenó el historial.

| Archivo protegido | SHA-256 exacto del blob Git, antes = después |
| --- | --- |
| SQL 0105 | `90eb081d9547456abef06f8ca74d46130367f437f472dc35836e43af9df8f663` |
| SQL 0106 | `b364165b0d27f207b7a2b99ecfe1fa00ceab70ba4277ff1b3d155a3fd4d0d2a1` |
| Snapshot 0105 | `3d20b42bd1d26c591abb1c2c8d2a91226da7df7ffcaaada8c8c4020f4b278a9c` |
| Snapshot 0106 | `9dd08d593a8270b34abdf21ece6ce323d85f483014bb233152f16bee39905007` |
| Journal 0000–0106 | `67dc478a840a0f7330537dad24f0d3462168b41deebbe5b9e04d75c8b4bc2070` |

El journal conserva 107 entradas continuas; 0105 mantiene
`when=1792391158311` y 0106 `when=1792392861354`. Los snapshots y su cadena
permanecen intactos. Los cuatro archivos del corpus Auth comparable conservan
sus blobs anteriores.

No se hicieron cambios adicionales de producto: todo el runtime TypeScript de
`src` y `supabase/functions` coincide con el main incorporado. La única diferencia
Edge frente a main en esa comparación es el test ya existente de 284
`supabase/functions/stamp-cfdi/booking_claim_test.ts`, no un handler modificado.
La corrección de 284 sigue siendo exclusivamente sus guards SQL revisados.

## Validación del árbol integrado local

- REP: **58/58 PASS**, sin skips, mismo corpus de cuatro archivos.
- Tipos de aplicación: PASS.
- Tipos browser/Playwright: PASS.
- Journal: **107 migraciones**, sin incidencias.
- ESLint de los 22 archivos TS/TSX incorporados respecto del head anterior:
  PASS, sin advertencias.
- Build Vite: PASS. Se usó loopback ficticio y se deshabilitó subida Sentry;
  sólo verifica compilación. No se ejecutó el prebuild que reescribe timestamps
  de versión ni se modificó el release. Los avisos del bundler sobre directivas
  de módulos y `fontkit.open` quedan registrados localmente; no se parchearon
  dependencias. El artefacto local **no se entrega para publicación**.
- Diff check: PASS; sin conflictos sin resolver ni ediciones de producto fuera
  de las importadas de main.

`main-reconciliation.json` conserva hashes comparables y resúmenes seguros.
Los logs completos y el diff binario anterior→nuevo head quedan en `.tool-tmp`,
fuera de los entregables públicos; el coordinador recibe su ruta y hash al
terminar. La evidencia Auth anterior permanece anclada a su SHA original.

**Auth/RLS 97 del nuevo head está pendiente del CI efímero existente tras el
push coordinado.** El 97/97 anterior no se atribuye a esta integración. No se
ejecutó backend local/publicado, SQL, PAC, navegador, Docker ni CLI remoto, y no
se alteraron cuentas, credenciales o permisos. El manifiesto de activación
permanece en su worktree separado, sin modificación por esta tarea.
