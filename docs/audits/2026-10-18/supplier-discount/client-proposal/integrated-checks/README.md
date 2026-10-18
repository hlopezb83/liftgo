# Verificación del parche propuesto sobre main fusionado

El coordinador aplicó temporalmente `proposed-client.patch` (SHA-256 `00448bf60916efb9ec4dc79291176c2f0a119b7038c152a437d88fa7200b0cf8`) en el worktree separado `audit-k1-client-review`, rama local `audit/k1-client-validation-20261018`, base `89967ae5768cf23d18d65c975d2cc0ac13031cb4`. No hubo commit de producto, publicación, conexión a BD ni operación de Chrome.

| Comando | Resultado | Log |
| --- | --- | --- |
| `node node_modules/eslint/bin/eslint.js src/features/accounts-payable/hooks/useSupplierBillMutations.ts src/lib/rpc.ts src/features/accounts-payable/hooks/__tests__/useUpdateSupplierBill.rpc.test.tsx --max-warnings=0` | Exit 0 | `lint.txt` |
| `node node_modules/typescript/bin/tsc --noEmit` | Exit 0 | `typecheck.txt` |
| `node node_modules/vitest/vitest.mjs run src/features/accounts-payable/hooks/__tests__/useUpdateSupplierBill.rpc.test.tsx --maxWorkers=1` | Exit 0, 3/3 | `tests.txt` |

Entorno: Node 24.19.0, dependencias del lockfile existente mediante junction al checkout de integración. TEMP/TMP apuntaron a `.tool-tmp` dentro del worktree. Las ejecuciones offline y la junction usaron escalación aprobada. No se repitió build global: el cambio propuesto sólo altera el transporte de una mutación y su registro de nombre; el build del producto fusionado ya estaba aprobado en PR274. Esta comprobación no acredita tipos SQL generados, despliegue de la RPC ni compatibilidad del catálogo publicado.

Tras terminar, `git apply --reverse --check` y `git apply --reverse` retiraron exactamente el parche temporal. `git diff --exit-code -- src` y `git status --short -- src` quedaron vacíos. El test nuevo dejó de existir. Los blobs originales de HEAD y de las fuentes restauradas coinciden:

- `useSupplierBillMutations.ts`: `6be00b69833c0a3525083d4e927c24479de4c04f`.
- `src/lib/rpc.ts`: `c63164d157a991df17e0a9ed508bdf2835a7e256`.

El diff documental se verificó con `git diff --check origin/main...HEAD -- . ':!*.txt' ':!*.patch'`: salida 0. Se excluyen logs crudos con padding de psql y el artefacto `.patch`, cuyas líneas de contexto vacías contienen el prefijo de espacio propio del formato diff. No se alteraron esos artefactos para cambiar su evidencia.
