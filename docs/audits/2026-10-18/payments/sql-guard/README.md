# N7/N8: caracterización SQL efímera del guard servidor

El guard de sobrepago **no bloquea el caso N7 de dos pagos MXN 1** sobre factura USD 100 / TC 17.5. Para N8, **sí bloquea editar a MXN 350 una fila histórica con `payments.exchange_rate=1`**, pero acepta ese importe con TC del pago 17.5 o 18 en este fixture. La diferencia depende de la tasa almacenada en el pago, no del validador corregido.

Es evidencia de negocio SQL aislada, con filas sintéticas. **No es una reproducción en datos publicados, una prueba de RLS/autorización, ni una publicación o migración de producto.** No se cambió app/src, SQL de producto, main ni PR 274. Se creó la rama local separada `audit/payment-guard-evidence-20261018`; no se hizo push. PR 274 había sido fusionado por el padre en `89967ae5768cf23d18d65c975d2cc0ac13031cb4`; esa rama/PR quedó fuera de este trabajo de evidencia.

## Procedencia y entorno

- Base auditada original: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.
- Código de helpers comprobado en este worktree: `c3e0759da7d740846fb50c61a461c6efd97a45bf` (incluye N7 y ajuste de centavos N8). Hashes de fuentes en `source-manifest.json`.
- La comparación local contra `origin/main` fusionado `89967ae5768cf23d18d65c975d2cc0ac13031cb4` terminó con diff vacío/salida 0 para `paymentCurrency.ts`, `validateEditPaymentAmount.ts` y `EditPaymentDialog.tsx`. Blobs respectivos: `e9b5217e087cbd4a3b5120f76e5c8ca66827d5cf`, `74095e0ea20d757aa195db65f0c5db5baf544fa9`, y el tercero registrado en `merged-source-match.log`. Así, la comparación de helpers corresponde al código fusionado, sin modificarlo.
- El padre obtuvo sólo definiciones de catálogo por SELECT mediante su conector existente. Snapshot íntegro: `../server-guard/remote-current-payment-guards.json`. Identificador de proyecto suministrado: `e25ace4a-172e-4082-a037-00473dacf2f2`; database `postgres`; reader role `postgres`; observado `2026-10-18T16:37:39.28484-06:00`. No contiene filas de clientes/pagos ni credenciales.
- PostgreSQL **17.9**, binarios `C:\Users\torta\Documents\Codex\tooling\postgres-17.9\extract\pgsql\bin`. Cluster nuevo `.local-pg/data-n7n8`, **127.0.0.1:55439**, DB **`liftgo_payment_guard_fixture`**. Sin conexiones remotas. No se utilizó el cluster K1 de puerto 55438.
- El SQL de las cinco funciones del snapshot se cargó sin cambiar su cuerpo: `enforce_payment_within_invoice_total`, `enforce_payment_matches_invoice_currency`, `prevent_payment_mutation_when_rep_stamped`, `fx_convert_amount`, `fx_is_missing`. La comparación de `pg_get_functiondef` local y snapshot pasó para sobrepago y REP.
- `projected-balance-view.sql` conserva los CTE `pay` y `cn` **exactos del catálogo actual** y sólo proyecta las columnas necesarias para la prueba. No se afirma haber restaurado toda la vista o esquema publicado.
- Los demás helpers se extrajeron del repositorio con `prepare-fixture.ps1`; sus rutas y SHA-256 están en el manifiesto. Incluyen `sync_invoice_status` de `drizzle/0041…`, wrapper, amount_mxn, redondeo, fecha/periodo y guard de borrado REP. El snapshot no verifica las definiciones desplegadas de esos helpers auxiliares.

Las columnas monetarias relevantes son `numeric` sin escala fija, igual que las fuentes y el catálogo leído. En particular: `payments.amount numeric NOT NULL`, `currency text NOT NULL DEFAULT 'MXN'`, **`exchange_rate numeric NOT NULL DEFAULT 1`**. Por ello, `NULL` explícito es una entrada no persistible; no se usa como pago histórico válido. El código repo no prohíbe `MXN / exchange_rate=17.5` o 18 mediante un CHECK de tasa neutral.

## Resultados concretos

Las 29 expectativas de `cases.sql` son de **caracterización**, varias confirman discrepancias que siguen presentes. No significan “29 correcciones servidor aprobadas”. Resultado final: **17 aceptaciones SQLSTATE `00000`, 10 rechazos `23514`, 2 rechazos NOT NULL `23502`**, todos coincidentes con la expectativa declarada. Detalle completo, statements, mensajes, HINT, observaciones y defs locales en `fixture-results.json`; consola en `fixture-final-run.log`.

| Caso sintético | SQL observado | Interpretación |
| --- | --- | --- |
| N7 USD 100 / TC 17.5, dos MXN 1; TC pago default 1, 17.5, 18 o 0 | Ambos INSERT aceptados para las cuatro tasas. Vista pagado USD **0.12**, saldo **99.88**. Helper real coincide. | El guard no impide reproducir el cálculo N7 con filas persistibles. TC 0 hace fallback a factura en el guard. |
| N7, pago MXN 1 con TC NULL | `23502`, viola NOT NULL | Variante inválida como fila persistida; se probó su rechazo, no un saldo con NULL publicado. |
| N8 crear original MXN 175 / TC default 1 en factura USD 100 | `23514`: compara **175 > 100** | Ese original no puede crearse con este guard activo. No prueba que existan filas así publicadas. |
| N8 original histórico MXN 175 / TC 1, vista saldo USD 90; editar MXN 350 | `23514`: compara **350 > 100**; fila permanece 175 | Bloqueo real del guard actual sobre esa variante preexistente, aunque helper N8 permita el importe. La fila se sembró explícitamente antes de instalar triggers sólo en el fixture. |
| N8 original MXN 175 / TC 17.5 o 18, editar MXN 350 | INSERT del original aceptado; UPDATE aceptado. Vista antes pagado 10/saldo 90; después pagado 20/saldo 80. | El caso N8 central sí puede funcionar bajo esas tasas legales. No se ha probado la pila completa publicada. |
| N8 original MXN 175 / TC NULL | `23502` | No es fila persistible. |
| N8 TC pago 17.5, editar al máximo MXN 1750 | Aceptado; vista pagado USD 100, saldo 0, status paid | Máximo nominal coincide en este caso. |
| N8 TC 17.5, editar MXN 1750.02 | `23514`; mensaje redondeado dice “100.00 excede 100.00” | El guard calcula **100.001142857… > 100** sin redondear. Vista/helper convertirían ese pago a USD **100.00** y el validador cliente lo permite. Persiste una diferencia servidor. |
| N8 TC 17.5, editar MXN 1750.26 | `23514` (importe crudo > 100); vista/helper redondean USD 100.01 | El cliente mantiene la tolerancia existente de 0.01 en moneda de factura; el guard no concede esa tolerancia de sobrepago. |
| N8 TC pago **18** vs factura **17.5**, editar MXN **1800** | Aceptado: guard **1800/18 = 100**. Vista/helper pagado **102.86**; validador cliente rechaza con máximo nominal **1750**. | La preferencia por TC del pago también puede hacer el guard más permisivo que la política canónica. Condición de API/fila histórica sintética; no se detectó una transacción publicada. |
| Factura MXN 17.50, original USD 1 / TC 17.5, editar USD 1.01 | `23514`: 17.675 > 17.50 (mensaje 17.68) | Coincide con la regresión cliente de centavos corregida. |
| REP stamped, editar amount 175→350 (TC 17.5) | `23514` del guard REP, texto “No se pueden modificar los campos fiscales…” | Se ejecutó la función real de catálogo, no un mock; el guard de sobrepago permitía 20 USD y el REP rechazó el cambio. |
| REP stamped, modificar sólo notas / intentar DELETE | Notas aceptadas / DELETE `23514` | Campo no fiscal conservado y guard de borrado real ejercitado. |
| Factura draft / cancelled / PUE stamped con pago parcial | `23514` en los tres casos, motivos específicos | Los guards incluidos permanecen activos; no se omitieron los parches draft/advisory/PUE del guard de sobrepago. |

### Frontera de redondeo y estado

También se ejecutó factura **USD 0.12** con dos pagos MXN 1 / TC 17.5. Ambos INSERT se aceptan. Cada conversión canónica da 0.06: vista/helper pagado 0.12 y saldo 0; sin embargo, el helper SQL de sincronización deja **status partial**. Usa la suma cruda **0.114285714…**, que al asignarse a `v_paid numeric(14,2)` da **0.11**: queda por debajo de la frontera **0.115**, necesaria para redondear a 0.12. Es una diferencia de estado servidor separada del detalle corregido, sin cambio de SQL propuesto aquí. No se ejecutó una factura de total 0.115; esa cifra describe la frontera aritmética.

## Qué queda fuera y qué demuestra cada aceptación

El usuario SQL de los casos fue el rol **`authenticated` local sintético**, con login de administración local `postgres`. Los triggers SECURITY DEFINER pertenecen al propietario local. Se usaron stubs explícitos `auth.uid`, `is_internal_member`, `current_internal_organization_id` y `resolve_organization_context` sólo para permitir al helper de sincronización procesar una organización sintética. **Esto no verifica identidad, roles, RLS ni ACL del producto.**

Se instalaron nueve triggers con su wiring de catálogo: sobrepago; moneda; amount_mxn; redondeo; fecha; periodo fiscal; REP UPDATE y DELETE; sincronización de estado. Se omitieron expresamente estos cuatro triggers de payments:

1. `audit_payments` (auditoría).
2. `trg_guard_is_e2e` (banderas de prueba).
3. `trg_notify_payment_received` (notificaciones).
4. `trg_organization_write_context` (autorización/contexto de escritura de organización).

Tampoco se restauraron las políticas RLS/ACL, el resto de columnas/constraints ajenas al cálculo, ni triggers de invoices que puedan activarse al sincronizar status. Los periodos fiscales estaban vacíos y las fechas sintéticas válidas. Por tanto, una **aceptación** acredita los guards incluidos bajo este fixture, no que una escritura publicada esté autorizada o que otros guards la acepten. Los rechazos incluyen el SQLSTATE y el motivo específico del guard ejercitado.

Las filas N8 históricas se sembraron por el propietario **antes de instalar triggers**; esto está señalado en `fixture-schema.sql`. Para tasas 17.5/18 se probó además creación normal del original con triggers activos. Para TC default 1 esa creación normal falla. No se usó un bypass para presentar como exitosa una operación rechazada.

El estado REP `stamped` también se sembró sintéticamente para ejercitar los guards; no se emitió ni timbró un REP ni se consultó el SAT.

La captura de pagos ordinaria actual bloquea moneda a la factura (`useRecordPaymentForm.ts:34`), usa TC 1 para MXN y precarga TC de factura para divisa (`:36`, `:155`, `:173`). Estos cruces de moneda caracterizan registros heredados, importaciones/API o escenarios sintéticos; no demuestran que el formulario de alta actual los genere. No se solicitaron ni examinaron filas publicadas para cuantificar cuántos hay.

No se preparó arreglo SQL, GRANT de producto, migración, despliegue ni transacción real. El padre debe decidir el alcance y coordinación de una eventual alineación de guard/sync con la política canónica, y la QA publicada sigue separada.

## Archivos, comandos y cierre

Preparación reproducible de artefactos (sólo escribe en esta carpeta):

```powershell
./docs/audits/2026-10-18/payments/sql-guard/prepare-fixture.ps1
```

Comando ejecutado de caracterización, tras crear exclusivamente la DB efímera indicada:

```powershell
& 'C:\Users\torta\Documents\Codex\tooling\postgres-17.9\extract\pgsql\bin\psql.exe' -X -h 127.0.0.1 -p 55439 -U postgres -d liftgo_payment_guard_fixture -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/payments/sql-guard/fixture-schema.sql -f docs/audits/2026-10-18/payments/sql-guard/extracted-functions.sql -f docs/audits/2026-10-18/payments/sql-guard/projected-balance-view.sql -f docs/audits/2026-10-18/payments/sql-guard/installed-triggers.sql -f docs/audits/2026-10-18/payments/sql-guard/cases.sql
```

Salida final **0**. `fixture-results.json` se exportó con `psql -X -qAt` al mismo host/puerto/base usando `export.sql`. Comparación offline contra helpers reales:

```powershell
$env:TEMP = 'C:\Users\torta\Documents\Codex\2026-10-18\task-2\audit-payments\.tool-tmp'
$env:TMP = $env:TEMP
node node_modules/vitest/vitest.mjs run --config docs/audits/2026-10-18/payments/sql-guard/helper-compare.config.ts --maxWorkers=1
```

**19/19 comprobaciones pasan**, salida 0, `helper-compare-vitest.log`: 13 comparaciones vista/helper de observaciones, igualdad de defs actuales de sobrepago/REP y comprobaciones explícitas de las discrepancias y guards. No se repitieron tipos/build globales por tratarse sólo de evidencia fuera de app/src.

Incidencias de preparación conservadas: initdb bajo sandbox se quedó al probar procesos hijos; se canceló y conservó el directorio incompleto, y la inicialización elevada del directorio definitivo terminó correctamente (`initdb-elevated.log`). Un primer montaje falló por cargar `fx_convert_amount` antes de `fx_is_missing` (`fixture-run.log`, salida 3); se corrigió sólo el orden del generador de fixture y se recreó **únicamente** `liftgo_payment_guard_fixture` local. Esos fallos de setup no se cuentan como expectativas de negocio. No hubo rechazo de auto-review pendiente.

Cluster detenido mediante `pg_ctl -D <ruta exacta .local-pg/data-n7n8> -m fast -w -t 30 stop`: **STOP_EXIT_CODE=0**. Verificación posterior: **`pg_ctl: no server running`, STATUS_EXIT_CODE=3**. Evidencia en `stop.log`. Los directorios de datos permanecen ignorados localmente y no se incluyen en el commit.
