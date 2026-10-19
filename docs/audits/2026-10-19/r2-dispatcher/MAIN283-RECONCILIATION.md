# PR 284: reconciliación con main que incluye PR 283

Esta evidencia sustituye únicamente el punto de integración de main anterior
registrado en `MAIN-RECONCILIATION.md`. El head previo de 284 era
`f9379a270caac4b3e83b8c56b2d077d3c5859723`; se incorporó el main fijado
`a72ecf2a485fceb3bd5aca12310b3d3d22b51efd` mediante merge local normal
`--no-commit` en el worktree aislado inicialmente limpio. No hubo conflictos
ni ediciones manuales de producto.

La comparación exacta de blobs Git conserva los 48 archivos incorporados desde
main y los 22 archivos propios de 284 que no cambian en ese main. Todo `src`
y los handlers Edge coinciden con main a72; la diferencia Edge existente de
284 es su test de claim, sin modificación del handler. Los cinco blobs
SQL/metadatos y los cuatro archivos del corpus Auth de 284 permanecen intactos:

| Archivo | SHA-256 exacto, antes = después |
| --- | --- |
| SQL 0105 | `90eb081d9547456abef06f8ca74d46130367f437f472dc35836e43af9df8f663` |
| SQL 0106 | `b364165b0d27f207b7a2b99ecfe1fa00ceab70ba4277ff1b3d155a3fd4d0d2a1` |
| Snapshot 0105 | `3d20b42bd1d26c591abb1c2c8d2a91226da7df7ffcaaada8c8c4020f4b278a9c` |
| Snapshot 0106 | `9dd08d593a8270b34abdf21ece6ce323d85f483014bb233152f16bee39905007` |
| Journal | `67dc478a840a0f7330537dad24f0d3462168b41deebbe5b9e04d75c8b4bc2070` |

El journal conserva las 107 entradas anteriores de 284 y el prefijo exacto
de las 106 entradas de main; no se duplicó 0105 ni se cambió 0106.

Validación local del árbol integrado:

- Vitest: **99/99 PASS** en diez archivos, sin skips. Incluye el corpus REP
  comparable **58/58** y 41 casos de fechas, SAT, formulario y compatibilidad
  de PR 283. Transporte y dependencias de pruebas son offline.
- Tipos de aplicación y browser/Playwright: PASS.
- Journal: 107 migraciones registradas en orden, PASS.
- ESLint de los once archivos TS/TSX importados: PASS, cero advertencias.
- Build Vite directo: PASS, sin prebuild que reescriba la versión; se usó
  URL loopback ficticia y subida Sentry deshabilitada. El build local verifica
  compilación y no es un artefacto de publicación. Se conservaron los avisos
  habituales de dependencias sin modificar paquetes.
- `git diff --cached --check`: PASS, sin conflictos.

`main283-reconciliation.json` incluye las comparaciones por archivo y resultados
seguros. Los logs completos y el diff entre heads quedan en `.tool-tmp`, sin
publicar capturas crudas del backend. El archivo de rutas reescrito por el build
fue restaurado desde el índice ya verificado; no hay cambio de producto extra.

**Auth/RLS del nuevo head queda pendiente del CI efímero coordinado tras el push
del root.** Ningún resultado Auth previo se atribuye a este merge. No se hizo
push, merge remoto, backend, migración, deploy, Docker, navegador, PAC ni cambio
de permisos, cuentas o credenciales. El manifiesto en su otro worktree sigue
intacto. La comprobación de integración que rechazó el head previo no se
reintentó por otra ruta; esta tarea prepara un nuevo commit local revisable.
