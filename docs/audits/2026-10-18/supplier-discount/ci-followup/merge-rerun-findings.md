# Merge posterior al reintento del shard 5

Diagnóstico de sólo lectura de CI [39174304148](https://github.com/hlopezb83/liftgo/actions/runs/39174304148), PR 273, head `a7704ca0aa35a55243f3fa6469a91809364e14d5`. El checkout de los logs corresponde al merge sintético `07366befa0d5b0a7420a025cc078057c87036ea6` con main `89967ae5768cf23d18d65c975d2cc0ac13031cb4`. El snapshot de run declara intento 2, estado `completed`, conclusión `failure`; no es CI verde.

## Fallo exacto

El job [117815075412, Pruebas (merge + cobertura)](https://github.com/hlopezb83/liftgo/actions/runs/39174304148/job/117815075412) falla en el paso 10, `Merge de reportes + umbrales de cobertura`, comando `bunx vitest --merge-reports --coverage`, salida 1.

El reporte combinado conserva el fallo antiguo de `BankReconciliationWorkspace.test.tsx:142`: “J navega fuera de la ventana virtual y al cerrar enfoca el listado sin perder selección ni scroll”; `Test timed out in 5000ms`. Resultado combinado: **1 archivo fallido / 606 aprobados; 1 prueba fallida / 3895 aprobadas**. La duración del archivo, 10016 ms, coincide con el resultado del shard original. `--merge-reports` consume resultados existentes; este mensaje no prueba que la prueba bancaria se ejecutara de nuevo dentro del merge.

No hay un error de umbral de cobertura en el log. La tabla de cobertura se genera (All files: statements 50.56%, branches 46.17%, functions 41.44%, lines 51.97%). El fallo explícito conservado es el timeout de la prueba.

## Cadena de artefactos comprobada

| Ejecución | Resultado | Artefacto `vitest-blob-5` |
| --- | --- | --- |
| Original [117813688771](https://github.com/hlopezb83/liftgo/actions/runs/39174304148/job/117813688771) | 1 prueba falló / 587 pasaron; archivo bancario 10016 ms | **12154135730**, creado 22:57:34 UTC, digest `7fc2c7b77ca91f67c46b3a872995067714730b42ab708aa687070a88950ebd90` |
| Reintento [117814636578](https://github.com/hlopezb83/liftgo/actions/runs/39174304148/job/117814636578) | **588/588 pruebas, 101/101 archivos**; banco 11/11, archivo 7341 ms | **12154021554**, creado 23:01:57 UTC, digest `0e58dd0f151fbee72c8d008f96a044da44dab2808fe98bcff57a1fec754439e7` |
| Merge 117815075412 | Descarga por nombre `vitest-blob-5` | El log selecciona explícitamente **12154135730**, el original fallido, y comprueba su digest antiguo |

La API de artifacts devuelve ambos IDs con el mismo nombre, sin expiración. El merge tuvo disponibles los dos, pero descargó el original. Esto explica por qué seis shards figuran aprobados en la lista de jobs actual mientras el merge sigue mostrando el timeout original. No se presupone que el orden o el mayor ID sea el más reciente: las asociaciones anteriores se comprueban contra los mensajes de upload de cada job y los timestamps.

El merge muestra siete duraciones en su línea `Per blob`; no se descargaron ni inspeccionaron los ZIPs para atribuir individualmente todos los blobs. Esa observación no se necesita para identificar el artefacto antiguo elegido. No se afirma que repetir la descarga vaya a elegir siempre el mismo ID, sólo que repetir el merge sin resolver la ambigüedad no garantiza consumir el reintento aprobado.

## Recomendación para root

- Conservar esta corrida roja y su primer timeout como evidencia. El shard 5 ya tiene un reintento aprobado; no hace falta volver a ejecutar la prueba para explicar este fallo de merge.
- No declarar aprobado CI a partir de los seis shards: el gate combinado sigue fallando.
- Reintentar **sólo el merge 117815075412** sería apropiado después de garantizar que consuma el artefacto aprobado **12154021554** y no el fallido **12154135730**. El workflow actual descarga por nombre y este intento demuestra que puede tomar el antiguo; un reintento sin más no garantiza resolverlo.
- Si se conserva el workflow y todos sus artefactos sin modificación, la opción limpia es una **nueva corrida completa de CI con un run ID nuevo**, mediante `workflow_dispatch` de `.github/workflows/ci.yml` sobre la misma rama/head exacto. Así los seis shards y el merge comparten un namespace de artifacts nuevo. Verificar nuevamente el SHA y todos los gates antes de describirla como verde. No propongo un commit vacío, cambiar el producto ni aumentar el timeout como parte de esta auditoría.
- Una mejora del manejo de artefactos de reintentos puede tratarse en un cambio de CI separado; este diagnóstico no lo implementa.

## Archivos y límites

- `merge-rerun-job-117815075412.log`: log completo decodificado del merge fallido.
- `merge-rerun-shard5-original-117813688771.log` y `merge-rerun-shard5-retry-117814636578.log`: logs completos para comprobar estado y asociación de uploads.
- `merge-rerun-jobs.json`, `merge-rerun-artifacts.json`, `merge-rerun-run.json`: snapshots de las consultas GitHub de sólo lectura.

La API de jobs utilizada devuelve el intento más reciente; sus jobs y pasos se guardaron tal como los devolvió el conector. Los artifacts son del run completo. Se consultaron logs y metadatos de GitHub y se escribieron únicamente archivos nuevos `merge-rerun*` en esta carpeta. No se alteró el README del diagnóstico anterior, código, tests, workflow, artifacts remotos, estado de jobs, base de datos ni Chrome. Root conserva la responsabilidad de cualquier mutación de CI.

