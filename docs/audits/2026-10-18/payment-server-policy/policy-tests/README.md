# Pruebas de política canónica de pagos — N7/N8 servidor

Suite **sintética y local**, sin transacciones ni migraciones publicadas. Worktree `audit-payment-policy-tests`, rama `audit/payment-policy-tests-20261018`, base `89967ae5768cf23d18d65c975d2cc0ac13031cb4`. Este trabajo sólo agrega archivos dentro de `docs/audits/2026-10-18/payment-server-policy/policy-tests`; el integrador es responsable del SQL de producto y de los cambios cliente.

## Resultado reproducible

| Ejecución | Expectativas SQL | Resultado | Evidencia |
| --- | --- | --- | --- |
| Actual publicado reconstruido desde catálogo | 106 idénticas a la suite final | **62 pasan / 44 fallan**, `SUITE_EXIT_CODE=3` por `CANONICAL_POLICY_EXPECTATIONS_FAILED: 44` | `red-final-run.log`, `red-final-results.json` |
| Primer candidato, SHA-256 `8B2E87DCAC79C56D884C23E3351CFCF61CF8BEBE0D8CDADAA7F1D19BF046D943` | 106 | **105 pasan / 1 falla**: `amount_mxn=0.26` frente a `0.35` para USD 0.015 | `candidate-01.sql`, `candidate-01-verified-run.log`, `candidate-01-verified-results.json` |
| Candidato final, SHA-256 **`9261E8B61C0F699AE57B336A36982A4ACF4868E2984712302AC92D0222E91271`** | **106** | **106 pasan / 0 fallan**, `SUITE_EXIT_CODE=0` | `candidate-02.sql`, `green-final-run.log`, `green-final-results.json` |

La roja expresa la política que se espera de la corrección: sus 44 fallos son diferencias funcionales, no fallos de montaje. El runner sólo empieza `suite.sql` después de que todos los objetos se cargan correctamente. Las capturas finales usan salida nativa `psql -o` con UTF-8, para conservar literalmente las diez definiciones de catálogo. Los intentos previos de captura se archivan sólo dentro del directorio local ignorado; no son evidencia de las fases finales.

`verify-evidence.ps1` comprueba offline que nombres y expectativas son idénticos antes/después, que las diez definiciones base coinciden con los snapshots recibidos, que la base de ambas fases es la misma y que los bytes del candidato verde son los indicados. Comprueba además que FX/REP no cambiaron y que están montados el guard real de integridad de factura y el wiring de importe/moneda/TC.

## Contrato y fronteras cubiertas

La política acordada con el integrador convierte el **importe de origen ya redondeado a centavos** mediante `fx_convert_amount`, redondea cada pago a moneda de factura y después suma. La moneda se compara sin distinguir mayúsculas/minúsculas. Para MXN se ignora su TC; para monedas extranjeras con conversión necesaria, TC nulo/0/1 no es utilizable. Misma moneda no requiere TC. El límite de sobrepago es **estricto después de la conversión**: no se agrega tolerancia de 0.01 servidor. El integrador alinea por separado el validador cliente con ese límite.

- **N7:** factura USD 100, TC 17.5, dos pagos MXN 1, con TC del pago `DEFAULT 1`, 17.5, 18 y 0: todos los INSERT deben aceptarse, pagado **0.12**, saldo **99.88**, status `partial`.
- **Estado pagado:** el mismo par sobre factura USD **0.12** debe dejar pagado 0.12, saldo 0 y status `paid`, con las cuatro tasas. El guard **real** `guard_invoice_status_integrity` está instalado; no se sustituye por un stub ni se omite al sincronizar estado. No se usó `app.e2e_seed`/teardown para evadirlo.
- **N8:** original MXN 175 y saldo USD 90 sobre factura USD 100 / TC 17.5: editar a MXN **350** debe aceptarse para TC del pago 1, 17.5, 18 y 0; después pagado 20/saldo 80/status `partial`. También se comprueba crear el original con triggers activos para las cuatro tasas. Las filas de edición se siembran antes de instalar triggers para comparar el caso histórico de forma independiente.
- **Máximo estricto, cuatro tasas:** MXN **1750, 1750.02 y 1750.08** se aceptan porque convierten a USD 100.00; **1750.09 y 1750.26** se rechazan (`23514`) porque convierten a USD 100.01; **1800** se rechaza también con TC del pago 18. Tras los rechazos se conserva la última fila aceptada y la factura `paid` con pagado 100/saldo 0.
- **Divisas y faltantes:** moneda mixta `uSd`/`USD` sin TC (misma moneda), `mXn`/`uSd`, EUR→USD con tasas 20/17.5, falta de tasa de factura o de origen, y un pago existente con FX inválido. Se valida rechazo y rollback, sin fabricar pagado ni sumar silenciosamente sólo pagos convertibles. TC NULL en un pago MXN sigue siendo una violación NOT NULL (`23502`).
- **Integridad de factura:** sobre una fila histórica con FX inválido, `sync_invoice_status` no fabrica `paid`; el intento directo de marcar `paid` debe ser rechazado por el guard real.
- **Orden de redondeo:** USD **0.015** se persiste como **0.02**, se convierte a MXN **0.35** y el caché `amount_mxn` también queda **0.35**. Cabe en factura MXN 0.35; debe rechazarse en factura MXN 0.30, aunque la multiplicación cruda 0.015×17.5 daría 0.2625. Esta expectativa detectó el único fallo del primer candidato, informado al integrador y corregido en el segundo.
- **Sin pago prematuro:** USD 99.99 en factura USD 100 deja saldo 0.01/status `partial`.

Cada expectativa conserva su SQLSTATE, filas afectadas, mensaje/HINT y statement o valores observados en el JSON de la fase. `suite.sql` es la fuente del contrato; no se cambiaron las expectativas para hacer pasar el candidato final.

## Comparación decimal independiente del cliente

`decimal-probe.sql` se ejecuta después de la verde, sin modificar `suite.sql` ni las 106 expectativas. Crea una factura sintética USD 2500 / TC **17.500001**, inserta un pago MXN 175 con TC 1 y observa pagado 10/saldo 2490. El UPDATE a **MXN 43750.09** es aceptado (`00000`, una fila); `fx_convert_amount` devuelve **USD 2500.00**, la vista queda pagado 2500/saldo 0 y el guard real permite status `paid`. El cociente sin redondear se exporta como texto **`2500.0049999997142857`** para evitar perder precisión al leer JSON. Resultado y hashes de funciones en `decimal-probe-results.json`; destino verificado en `decimal-probe-cluster.json`.

`fx-vectors-export.sql` obtiene **48 vectores** de sólo lectura de PostgreSQL `numeric`, con valores positivos/negativos, medias unidades, tasas 17.5/17.500001/18/19.99/20, notación científica, misma moneda y FX faltante. Es un oráculo independiente del helper TypeScript: el test no calcula los resultados esperados mediante la implementación cliente. Los casos negativos caracterizan el helper de conversión; no son pagos insertados, cuya tabla exige importe positivo. El caso USD 0.015 en esta exportación prueba la conversión directa cruda (0.26); su normalización previa a 0.02 y luego 0.35 se verifica por separado en los guards de persistencia.

La misma prueba `fx-equivalence.test.ts` compara los 48 resultados SQL y cinco fronteras adicionales:

| Fuente cliente | Resultado | Evidencia |
| --- | --- | --- |
| Snapshot del cliente main `89967ae` | **43 pasan / 10 fallan**, exit 1 | `client-red-results.json`, `client-red-run.log` |
| Candidato leído **directamente** del `src` del integrador | **53/53 pasan**, exit 0 | `client-green-results.json`, `client-green-run.log` |

Ocho diferencias anteriores son conversiones (incluyendo las medias unidades negativas y el límite de seis decimales); otras dos son la tolerancia antigua de sobrepago y la falta de normalización previa del importe origen. El validador anterior permitía el caso de seis decimales por su tolerancia: su aceptación no demuestra que la conversión anterior fuera correcta. El candidato convierte a 2500.00 y lo admite con límite estricto.

`client-baseline-src` y `client-candidate-src` son **copias de lectura para reproducir la evidencia**, con SHA-256 en `client-source-manifest.json`. El candidato final se copió después de su ajuste para números grandes; los 48 vectores no incluyen 1e21. No se editó código de producto. El harness por defecto usa la copia candidata; `PAYMENT_CANDIDATE_SRC` permite apuntar a un `src` real, como se hizo para la ejecución verde. No se repitieron tipos/build globales.

La `.gitattributes` de esta carpeta conserva sus bytes sin normalizar finales de línea. Así los SHA-256 de capturas y copias exactas son reproducibles también después de un checkout en otro sistema.

## Procedencia y hashes

- `current-preflight.json`: proyección saneada de definiciones recibidas del integrador por SELECT de catálogo el 18 de octubre de 2026. Conserva sólo nombres, cuerpos SQL y wiring necesarios; no contiene identificadores de proyecto, direcciones del backend, ownership, ACL ni ledger. Incluye el guard real de integridad de factura y su trigger, además de guard/sync/REP/FX.
- `current-derived-function.json`: proyección saneada posterior de `trg_payment_amount_mxn`, sólo nombre y definición. Se usó su cuerpo real para la roja final.
- `current-catalog.json`: proyección saneada de la definición de vista recibida del integrador, usada **sólo** como fuente de los CTE exactos de la vista de saldo proyectada. `projected-balance-view.sql` conserva `pay`/`cn` y proyecta las columnas necesarias.
- `source-manifest.json`: SHA-256 de los snapshots y de helpers auxiliares extraídos del repo. No hay filas ni credenciales publicadas en estos snapshots.
- `baseline-hashes.sql`, los JSON de resultados y `function-hash-comparison.json`: definiciones completas y MD5 de `pg_get_functiondef` antes/después. Los diez hashes base coinciden en roja y verde. Los snapshots originales privados permanecen fuera del commit en `.local-pg/private-metadata`; las proyecciones no cambian los cuerpos ejecutables, comprobado al regenerar los tres SQL de montaje con hashes idénticos. Cambian seis funciones del candidato; `fx_convert_amount`, `fx_is_missing` y los dos guards REP conservan su hash. El cap de NC se carga y registra, pero sus casos funcionales corresponden a la suite paralela de guards.

El candidato es una copia de lectura del archivo del integrador `../audit-payment-server-fix/drizzle/migrations/0103_canonical_payment_invoice_currency.sql`. **Aquí no se editó esa migración, el journal, app/src ni ningún permiso/objeto publicado.**

## Aislamiento y límites

PostgreSQL **17.9**, cluster nuevo `.local-pg/data-policy`, **127.0.0.1:55440**, DB **`liftgo_payment_policy_fixture`**. No se usaron los clusters 55438, 55439 ni el 55441 de la suite paralela de guards/concurrencia. Antes de cada reset, `run-policy.ps1` consulta `data_directory` y el puerto y exige que coincidan con **este** worktree/cluster; sólo entonces recrea la DB fija del fixture. La identidad verificada queda en `<fase>-cluster.json`.

Caller SQL `authenticated` local sintético, login propietario local `postgres`; stubs expresos de `auth.uid`, `auth.jwt`, membresía y resolución de organización permiten ejecutar los helpers con una sola organización sintética. **No es una prueba de autenticación, RLS ni ACL del producto.** No se emitieron CFDI/REP ni se consultó SAT, Chrome o bases remotas.

Se instalan los nueve triggers de cálculo/guard de payments y **`trg_guard_invoice_status_integrity` real** de invoices. Se omiten auditoría, notificaciones, bandera E2E, escritura de organización y los demás triggers de invoices ajenos al cálculo. Las NC están vacías en esta suite; guards REP/NC, cambios sólo de moneda/TC, idempotencia, organización y concurrencia tienen cobertura separada en `guard-tests` del otro agente/cluster. La presente suite no sustituye esa cobertura ni QA publicada.

## Comandos ejecutados

Directorio de trabajo: `<user>\Documents\Codex\2026-10-18\task-2\audit-payment-policy-tests`.

```powershell
./docs/audits/2026-10-18/payment-server-policy/policy-tests/prepare-fixture.ps1
./docs/audits/2026-10-18/payment-server-policy/policy-tests/run-policy.ps1 -Phase red-final
./docs/audits/2026-10-18/payment-server-policy/policy-tests/run-policy.ps1 -Phase candidate-01-verified -CandidateSql ./docs/audits/2026-10-18/payment-server-policy/policy-tests/candidate-01.sql
./docs/audits/2026-10-18/payment-server-policy/policy-tests/run-policy.ps1 -Phase green-final -CandidateSql ./docs/audits/2026-10-18/payment-server-policy/policy-tests/candidate-02.sql
./docs/audits/2026-10-18/payment-server-policy/policy-tests/verify-evidence.ps1
./docs/audits/2026-10-18/payment-server-policy/policy-tests/run-decimal-probe.ps1
# Exportación de sólo lectura con psql -o y comparación offline:
psql -X -h 127.0.0.1 -p 55440 -U postgres -d liftgo_payment_policy_fixture -v ON_ERROR_STOP=1 -qAt -f ./docs/audits/2026-10-18/payment-server-policy/policy-tests/fx-vectors-export.sql -o ./docs/audits/2026-10-18/payment-server-policy/policy-tests/fx-vectors-results.json
$env:PAYMENT_CANDIDATE_SRC=(Resolve-Path ./docs/audits/2026-10-18/payment-server-policy/policy-tests/client-baseline-src).Path
node node_modules/vitest/vitest.mjs run --config docs/audits/2026-10-18/payment-server-policy/policy-tests/fx-equivalence.config.ts --reporter=default --reporter=json --outputFile=client-red-results.json
$env:PAYMENT_CANDIDATE_SRC=(Resolve-Path ../audit-payment-server-fix/src).Path
node node_modules/vitest/vitest.mjs run --config docs/audits/2026-10-18/payment-server-policy/policy-tests/fx-equivalence.config.ts --reporter=default --reporter=json --outputFile=client-green-results.json
Remove-Item Env:PAYMENT_CANDIDATE_SRC
```

El runner SQL ejecuta `psql -X -h 127.0.0.1 -p 55440 -U postgres -v ON_ERROR_STOP=1` con el montaje y luego `suite.sql`. Captura logs antes de exportar los resultados a JSON mediante `export.sql`, incluso cuando la suite roja termina con su excepción de expectativas fallidas. Esa suite no requiere Node. La comparación cliente usa Node/Vitest y dependencias locales existentes; su `root` se limita a este directorio para evitar escanear el cluster ignorado.

Cluster **detenido** al finalizar: `pg_ctl -D <ruta exacta .local-pg/data-policy> -m fast -w -t 30 stop` terminó **0**. Comprobación posterior: **`pg_ctl: no server running`, STATUS_EXIT_CODE=3**, en `stop-final.log` local. Directorio de datos ignorado localmente, fuera del commit. No se hizo push desde el subtrabajo.

## Copia pública saneada

El integrador reemplazó las rutas de perfil local por `<user>` en documentación/manifiestos/resultados públicos; los originales completos se conservan localmente. Los `.log` crudos se retienen localmente: los resultados estructurados JSON, los SQL de prueba, hashes de funciones y el resumen de ejecución se publican sin datos reales. Los hashes originales de scripts/manifiestos corresponden a la captura anterior al saneamiento; no se presentan como hashes de la copia con rutas sustituidas. Las fuentes cliente/SQL, los 106 casos, los 48 vectores y los valores esperados no cambiaron. Para reproducir comandos de PostgreSQL, sustituir el placeholder del directorio de herramientas por la instalación local; se conserva la restricción de host/puerto/base efímeros.
