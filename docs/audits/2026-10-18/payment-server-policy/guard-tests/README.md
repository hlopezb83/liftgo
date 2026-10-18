# Guardas y concurrencia del candidato servidor N7/N8

Evidencia local del candidato `0103_canonical_payment_invoice_currency.sql`; no se aplicó a una base publicada. Este worktree sólo aporta pruebas y documentación. El coordinador mantiene el SQL de producto en `audit-payment-server-fix`.

| Ejecución comparable | Antes: catálogo observado | Después: candidato |
| --- | ---: | ---: |
| Matriz de guardas, mismos 69 IDs y SHA de cases.sql | 59 pasan / 10 fallan | 69 pasan / 0 fallan |
| Carreras con dos sesiones y verificación después de COMMIT | 4 pasan / 0 fallan | 4 pasan / 0 fallan |
| Definiciones conservadas: REP update/delete, redondeo, ventana de fecha, periodo fiscal | 6 presentes e idénticas | 6 presentes e idénticas |

Candidato probado: SHA256 `9261e8b61c0f699ae57b336a36982a4acf4868e2984712302ac92d0222e91271`. Matriz: SHA256 `59b7029b240ac1d98fbf795545c821a989f8ca0bf7e4a351ef25bdb94e8aa630`. El runner captura una sola vez los bytes que aplica y calcula el hash sobre esos mismos bytes. La prueba concurrente exige que las funciones instaladas coincidan con las registradas por la matriz de su fase.

## Qué prueban los casos

- REP timbrado: rechazo específico de cada uno de los ocho campos fiscales, DELETE, cambio conjunto `rep_cfdi_status=none` + amount, y flags del caller; notas, referencia e importes fiscales idénticos permitidos. `.02→.015` debe rechazar por diferencia cruda aunque ambos redondeen a `.02`.
- INSERT y UPDATE monetario sobre facturas draft/cancelled, parcial PUE timbrada, total PUE, sobrepago, PUE pendiente y PPD timbrada. Cada aceptación debe afectar exactamente una fila y cumplir una lectura de valores.
- NC activas, canceladas, cancelación aceptada, CFDI pendiente y cancelación pending/rejected/expired. Se conserva el predicado actual: CFDI stamped, status distinto de cancelled y cancelación distinta de accepted; no se inventa la condición `status=stamped`.
- Cap de REP vigente en `enforce_credit_note_max`: dos pagos MXN1/17.5 son USD.12. Factura USD.12 rechaza NC.01; factura USD1 admite NC.88 y rechaza NC.89. REP stamped con rep_cancelled_at poblado y pago sin REP no topan la NC, conforme a la regla existente.
- Agregación de hijos con `COALESCE(child.organization_id, invoice.organization_id)=invoice.organization_id`: hijos de otra organización excluidos; pagos heredados con organización NULL incluidos. Se ejercita el scope explícito del sync con contexto interno simulado A contra factura B y contexto ausente. Un nuevo payment con organización NULL no se rechaza antes del trigger de organización omitido en este fixture.
- Orden de triggers: `.015 USD` con TC17.5 queda `amount=.02`, `amount_mxn=.35`; UPDATE sólo de currency revalida sobrepago. El sync de dos pagos MXN1 deja paid/saldo0 sobre USD.12 con el **guard real de integridad de factura y su trigger montados**.
- Datos heredados NaN: notas y borrado reparador permitidos, nuevo movimiento monetario rechazado. Payload idempotente conserva amount_mxn. Un REP heredado sin FX válido permite notas + amount idéntico y conserva amount175, TC0, amount_mxn999 y REP stamped.
- Cuatro carreras: INSERT/INSERT, UPDATE/UPDATE, INSERT/UPDATE, UPDATE/INSERT en la misma factura. B está bloqueado detrás de A según `pg_blocking_pids`/`wait_event`; tras COMMIT A, B rechaza con `23514` y mensaje de sobrepago. Una tercera sesión comprueba importes durables de 60/90/90/60 sobre total100 y status partial. Esto acredita serialización observada; no atribuye por sí solo la espera exclusivamente al advisory lock.

Los diez fallos anteriores son: currency-only sin revalidación; agregado de payment y NC de otra organización; amount_mxn .26 frente a .35; dos topes REP que sumaban antes de redondear; notas NaN simples e idempotentes; notas REP sin FX con payload idempotente; y sync N7 que conservaba partial. Los rechazos REP/draft/cancelled/PUE y los demás controles ya pasaban antes y siguen pasando.

## Evidencia y método

- [results/before.json](results/before.json), [results/after.json](results/after.json): SQLSTATE esperado/real, mensaje, ROW_COUNT, observaciones de filas, funciones y triggers instalados.
- [results-before.txt](results-before.txt), [results-after.txt](results-after.txt): salida completa de la matriz.
- [results/before-concurrency.json](results/before-concurrency.json), [results/after-concurrency.json](results/after-concurrency.json): PIDs, bloqueo observado, rechazo y lectura después de COMMIT; salidas en `results-*-concurrency.txt`.
- [source-manifest.json](source-manifest.json): hashes de las cuatro entradas de PR275 copiadas byte por byte, snapshots de catálogo y destino local. No se modificó el worktree fuente de PR275.
- [baseline/current-catalog-functions.sql](baseline/current-catalog-functions.sql) y [baseline/invoice-integrity-trigger.sql](baseline/invoice-integrity-trigger.sql): definiciones exactas del snapshot actual para guards, sync, FX, derivada amount_mxn, integridad de factura y tope NC. El snapshot de preflight fue recogido por el coordinador mediante SELECT de metadatos, no por este subtrabajo.
- [fixture-additions.sql](fixture-additions.sql), [build-cases.mjs](build-cases.mjs), [cases.sql](cases.sql), [run.mjs](run.mjs), [concurrency.mjs](concurrency.mjs): fixture sintético y harness reproducible. El runner exige los 69 IDs únicos y el mismo hash de matriz antes/después, y falla si una función preservada falta.

Cada caso de la matriz se ejecuta en una subtransacción. Las aceptaciones se leen y verifican antes de un rollback intencional; `persistence_unchanged=true` indica restauración del seed, **no COMMIT durable de esas aceptaciones**. Las excepciones negativas revierten naturalmente la operación y se contrastan con la imagen íntegra del fixture. Las cuatro carreras sí confirman persistencia después de COMMIT desde otra sesión. Ningún resultado acredita transacciones publicadas.

Preparación y comandos desde este worktree, después de iniciar sólo el cluster descrito en el manifiesto:

```powershell
node docs/audits/2026-10-18/payment-server-policy/guard-tests/prepare.mjs
node docs/audits/2026-10-18/payment-server-policy/guard-tests/build-cases.mjs
node docs/audits/2026-10-18/payment-server-policy/guard-tests/run.mjs before
node docs/audits/2026-10-18/payment-server-policy/guard-tests/concurrency.mjs before
node docs/audits/2026-10-18/payment-server-policy/guard-tests/run.mjs after
node docs/audits/2026-10-18/payment-server-policy/guard-tests/concurrency.mjs after
```

`before` devuelve código1 por los diez fallos esperados; `after` y ambas carreras devuelven0. Cada matriz recrea sólo los schemas sintéticos de `127.0.0.1:55441/liftgo_payment_guard_policy_fixture`, y verifica host/puerto/base antes de escribir. El cluster `.local-pg/data-guard-policy` fue nuevo para esta tarea y se detuvo al terminar; véase `local-cluster-status.txt`.

Los logs `results-harness-*.txt` conservan intentos de preparación supersedidos: TRUNCATE carecía del permiso sintético de la tabla de resultados (se sustituyó por DELETE), comparación de numeric como texto distinguía 60/60.00 (ahora compara valores), y la proyección sintética carecía de SELECT para authenticated (se concedió sólo sobre ese objeto local). Esos errores del harness no se presentan como fallos del producto. La matriz final antes/después usa el mismo harness corregido.

## Límites

No se restauró Supabase completo. `auth.uid`, `auth.jwt`, `is_internal_member` y contexto de organización son stubs; no hay RLS real ni prueba de ACL/autorización general de invocador. Se omiten los cuatro triggers de pagos audit/e2e/notificación/organización de PR275 y los demás triggers de factura/NC, salvo integridad de status y tope NC reales. Los grants locales sobre tablas sintéticas y la proyección sólo permiten ejecutar el harness y no representan permisos de producto. Los casos de organización prueban predicados y scope del código bajo esos stubs.

No se prueba ni modifica el join/RLS de la vista frente a datos mal asociados a otra organización. Las filas históricas inválidas son sintéticas, sembradas antes de habilitar guards para probar reparaciones y compatibilidad. No afirman que existan registros publicados equivalentes. Se mantienen las tolerancias históricas PUE y paid; no se amplía la política fiscal. No se prueban todos los flujos de reparentado, NC concurrentes, ni el wiring completo de producción. Este bloque ejecutó SQL y sintaxis de los scripts; los checks globales de aplicación, revisión del SQL y publicación pertenecen al coordinador.

## Empaquetado público posterior

Los casos y resultados ejecutados no cambian. Las capturas privadas originales de identidad de backend/ACL/ledger se retienen fuera del PR; `baseline/preflight-function-metadata.json` se publica sólo con nombres/definiciones/triggers. El manifiesto conserva sus hashes de procedencia, sin los datos internos. `prepare.mjs` verifica ahora los inputs sintéticos ya suministrados contra los bundles saneados del coordinador; `run.mjs` y `concurrency.mjs` usan resolución normal de la dependencia y el candidato dentro del checkout, sin exigir worktrees hermanos. Se verificó sintaxis y preparación de estas adaptaciones; no se presentan como una nueva ejecución de la matriz. La identidad fija de loopback y las salvaguardas previas a escribir se conservan.
