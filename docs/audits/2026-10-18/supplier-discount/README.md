# K1 v3 — RPC acotada propuesta; no aplicada a publicación

Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`. Historial: v1 `f10c35a2b60d6fde812cdafbebe00af79ea1c795`; v2 `4a5ec92578d8e8eca87af7b610c900d6aabec34d`; v3 es el commit que contiene esta propuesta y evidencia.

**El GRANT aislado está bloqueado y supersedido.** Se conserva literalmente en `historical-v2/proposed-discount-grant.sql`, junto al README, generador, SQL y logs v2. La v1 permanece en `historical-v1/` y su commit original. Ningún archivo de propuesta vive en directorios de migraciones automáticas. K1 sigue pendiente de revisión/aprobación y publicación coordinada.

La v2 demostró tres límites del GRANT aislado: descuento mayor al subtotal, edición de sólo descuento en aprobadas/parciales/pagadas y edición por perfil inactivo con rol admin/membresía. La v1 afirmaba bloqueo de inactivos usando otra policy; esa conclusión fue retirada en v2 y no se reutiliza. La v3 evita abrir UPDATE de descuento y valida ese nuevo canal mediante una RPC explícita. **No afirma cerrar las deficiencias preexistentes de todas las rutas de escritura.**

## Entregables revisables

| Archivo | Contenido |
| --- | --- |
| `proposed-supplier-bill-details-rpc.sql` | Propuesta transaccional `update_supplier_bill_details(uuid,jsonb) RETURNS uuid`, sin permiso UPDATE(discount). SHA-256 `899180d976f87186ca33c63159fcfb4c11b1870f1ddae379d5cfb67aad0102ba`. |
| `proposed-client.patch` | Cambio de transporte de la mutación a `callRpc`, registro del nombre de RPC y prueba nueva; **no aplicado al código activo**. SHA-256 `00448bf60916efb9ec4dc79291176c2f0a119b7038c152a437d88fa7200b0cf8`. |
| `rpc-acl-regression.sql` | Matriz SQL con rol authenticated/anon y SELECT de valores persistidos; misma prueba antes y después. |
| `rpc-concurrency.mjs` | Dos órdenes concurrentes con bloqueo real verificado mediante `pg_blocking_pids`, valores persistidos y limpieza. |
| `prepare-local-fixture.mjs`, `local-fixture.generated.sql`, `payment-guards.generated.sql` | Generación reproducible del subconjunto local a partir de SQL auditado y snapshots de catálogo. |
| `client-proposal/` | Prueba/harness copiables, logs rojo/verde y hashes de restauración exacta de las fuentes. |
| `local-target-and-acl-v3.txt`, `local-stop-v3.txt`, `local-status-v3.txt` | Destino local, ACL/configuración final de RPC, datos sintéticos restaurados y cluster detenido. |

## Frontera de la RPC propuesta

La allowlist de 18 campos coincide con el único caller actual de `useUpdateSupplierBill`, `useSupplierBillForm.ts:185–210`: `supplier_id`, `category`, `description`, `issue_date`, `due_date`, `coverage_start`, `coverage_end`, `currency`, `exchange_rate`, `subtotal`, `discount`, `tax_amount`, `retention_iva`, `retention_isr`, `total`, `cfdi_uuid`, `payment_method_sat`, `cfdi_xml_url`. Se rechazan claves desconocidas y todas las claves de identidad interna, estado, balance y aprobación. No hay SQL dinámico.

- `SECURITY DEFINER` con búsqueda fija `pg_catalog, public, pg_temp`; autorización por `auth.uid()`, claim authenticated, perfil **existente y activo**, rol admin/administrativo y membresía interna única en empresa activa. No se usa `current_user` para autorizar al llamador. El perfil explícito cierra en esta RPC el fallback activo de `is_active_user` cuando falta el perfil.
- `SELECT ... FOR UPDATE` de factura con `id` **y** organización explícitos; UPDATE estático con el mismo scope. Un cambio de proveedor exige proveedor activo de esa empresa y `FOR SHARE` sobre su fila. El definer no depende de RLS para acotar estas filas.
- Los tres GUC `app.cxp_rpc`, `app.cxp_recalc`, `app.audit_revert` quedan `off` durante la función mediante configuración de función; se restauran al regresar. Un claim de servicio no permite entrar por este canal. Las constraints/triggers existentes siguen ejecutándose; una prueba verifica el CHECK de cobertura por nombre y otra el umbral real de aprobación pese a flags heredados `on`.
- Se comparan cambios reales de **todos** los componentes monetarios, incluidos descuento/retenciones/moneda/TC, aunque el total quede igual. Se bloquean cambios monetarios o de identidad fiscal/proveedor en aprobadas, `paid`, `partial`, `cancelled` o con **cualquier** fila de pago. Identidad protegida: proveedor, CFDI UUID, fecha de emisión, método SAT y URL XML. Descripción y otros metadatos permitidos con importes/identidad idénticos conservan todos los demás campos, incluso en esos estados.
- Ante cambio monetario se exige descuento no negativo y no mayor al subtotal, componentes no negativos/finitos, moneda/TC válidos, y `total = round(subtotal-discount+tax_amount-retention_iva-retention_isr,2) >= 0`. Cambiar descuento exige total explícito. El contrato acepta JSON number, importes con máximo 2 decimales y TC con máximo 6; rechaza strings, NaN, null y precisión adicional en vez de redondear silenciosamente los inputs. Una edición exclusivamente de metadatos no intenta reparar importes legados idénticos.
- Se revoca ejecución a PUBLIC/anon/service_role y se concede EXECUTE a authenticated. **UPDATE(discount) permanece false**; UPDATE global y columnas de aprobación permanecen false. El propietario mantiene sus privilegios implícitos normales.

El puente cliente propuesto sustituye el UPDATE directo por `callRpc<string>("update_supplier_bill_details", {p_bill_id:id,p_patch:patch})`, sin fallback y con la misma invalidación/feedback. Añade el nombre a `RpcName` en `src/lib/rpc.ts`; no regenera tipos de Supabase ni afirma tipado SQL completo de los argumentos. Debe coordinarse con la RPC aprobada y la regeneración/verificación de tipos. El código activo fue restaurado byte por byte y **sigue usando el UPDATE anterior**; no se agregaron commits a PR274 ni a main.

## Evidencia realmente ejecutada

| Ejecución | Resultado | Evidencia |
| --- | --- | --- |
| SQL antes, sin RPC | psql exit **3**, SQLSTATE **42883** por función inexistente; antes de ese punto comprueba UPDATE directo discount denegado 42501 | `before-v3.txt` |
| Mismo SQL después, sólo RPC aplicada localmente | exit **0**, **95 mensajes PASS**, ROLLBACK final | `after-v3.txt` |
| Concurrencia local | exit **0**, **5 PASS**: ambos órdenes de bloqueo/rechazo, persistencias y limpieza | `concurrency-v3.txt` |
| Cliente antes, fuente original | exit **1**, 2 fallos y 1 control aprobado | `client-proposal/before.txt` |
| Cliente con patch temporal | exit **0**, 3/3 aprobadas | `client-proposal/after.txt` |
| Restauración/applicabilidad | fuentes con hashes originales, test temporal eliminado, diff/status de src vacíos, git apply --check exit 0 | `client-proposal/restoration.json`, `verification.txt` |
| Preparación/verificación | generación y `node --check` sin error; diff documental sin espacios finales fuera de logs crudos/artefacto patch; servidor detenido | SQL generado, `client-proposal/integrated-checks/README.md` y logs de estado |

**El rojo SQL no significa 95 pruebas fallando antes:** la ejecución se detiene al no existir la RPC. La evidencia v2 de denegación ACL está archivada; v3 comprueba además esa denegación directa antes y después de instalar la RPC local. Las pruebas del cliente usan mocks y no se presentan como reproducción de permisos o datos publicados.

La matriz SQL prueba admin/administrativo 0→positivo→0, payload de los 18 campos, metadata con importes idénticos, roles no autorizados, empresas ajenas/suspendidas, inactivo, sin membresía, portal con rol admin, perfil ausente, sin auth.uid, claim de servicio, proveedor ajeno/archivado, 15 claves protegidas/desconocidas, JSON/tipos/null/precisión, aritmética, descuento aislado y compensado en cinco escenarios con candado, GUC de bypass, constraints/triggers reales y ACL final. Cada rechazo compara la fila **visible** bajo RLS; para filas ocultas de empresa B y empresa suspendida se añade comparación privilegiada del dueño de prueba antes del ROLLBACK. Los positivos verifican SELECT de valores, no sólo ROW_COUNT; metadata verifica también que la descripción **sí cambió**.

Concurrencia: pago primero mantiene el bloqueo de factura, la RPC espera y después rechaza; persiste pago 10, total 100, descuento 0 y balance 90. RPC primero reduce total a 90, el guard de pago espera y después rechaza pago 95; no se inserta ese pago y persisten descuento 10, total/balance 90. Se observan `pg_blocking_pids` y SQLSTATE 23514; cleanup restaura la factura por RPC y retira sólo el pago sintético. El writer de pago es un actor local privilegiado que ejecuta los BEFORE/AFTER triggers versionados; **no es una prueba completa del endpoint register_supplier_payment, REP o batches**.

## Destino y fidelidad

Único destino modificado: PostgreSQL **17.9 local**, `127.0.0.1:55438`, DB `liftgo_k1_fixture_v3`, cluster `.local-pg/data-local`, propietario local postgres. Se crearon datos/roles sintéticos; no cuentas ni transacciones reales. Snapshot final: discount/global/aprobación false, total true preexistente; RPC SECURITY DEFINER con configuración de tres flags off y EXECUTE para authenticated. Servidor detenido y `pg_ctl status` devuelve **3: no server running**.

El coordinador hizo lecturas **SELECT de catálogo** por el conector existente del proyecto Lovable Lift GO, ID `e25ace4a-172e-4082-a037-00473dacf2f2`, SHA asociado `ec177edf...`, backend Supabase habilitado, DB `postgres`. Se conservan los tres `remote-current-{acl,guards,business-guards}.json` y `remote-current-internal-org-helper.json` (última observación 18/10/2026 22:47:56 UTC). No se deduce un destino de publicación a partir del .env. Este subtrabajo no abrió conexión remota ni modificó esos metadatos.

Fixture parcial: 6 helpers de acceso capturados (incluido el interno, cuyo cuerpo se compara con Drizzle0031), 9 funciones de protección y 10 triggers de bills del catálogo; DDL real, 3 policies y 12 constraints actuales, FORCE RLS. Los labels de expense_category proceden del tipo Database auditado, sustituyendo el placeholder `other` de v1/v2. Se extraen también auxiliares y los guards BEFORE/AFTER de pagos versionados. Se omiten auditoría, numeración, vencimiento automático, log de solicitud y updated_at, y se simplifican tablas auxiliares/policies de pagos. No reconstruye Supabase entero, JWT reales ni todas las rutas de registro. El seed `pending` con pago se deja deliberadamente inconsistente para probar el candado de **cualquier** pago independientemente del status; no reproduce un dato publicado.

## Límites y pendientes

1. Esta RPC protege el canal nuevo de edición; las ACL históricas aún permiten UPDATE directo de **otros** campos monetarios y de metadatos. No se revocan ni endurecen globalmente aquí. Tampoco se afirma corregir acceso raw de inactivos a otros campos. Una garantía global requeriría revisión separada de todos los writers/ACL/triggers.
2. La política nueva de precisión (2/6 decimales) y los candados adicionales de identidad fiscal requieren revisión de producto/datos antes de publicar; el cliente propuesto conserva el payload actual, cuyo formato real debe validarse con el carril de despliegue.
3. Los helpers/tablas, ownership y privilegios reales deben verificarse otra vez al preparar la migración forward-only aprobada. Las lecturas de catálogo no son una transacción publicada ni QA de publicación.
4. El subtrabajo original del puente no ejecutó tipos/build global ni navegador. El coordinador comprobó después el patch temporal sobre main fusionado: ESLint de sus tres archivos sin advertencias, TypeScript global y 3/3 pruebas, todos exit 0; fuentes restauradas y hashes originales comprobados. Véase `client-proposal/integrated-checks/README.md`. No se repitió build ni se publicó el patch o la RPC. Revisión/aprobación específica, coordinación RPC+cliente/tipos, pruebas completas del entorno autorizado y QA siguen pendientes.

## Comandos reproducibles

Desde este worktree (sin crear DB v3 sobre otra existente):

```powershell
$auditPgBin='C:\Users\torta\Documents\Codex\tooling\postgres-17.9\extract\pgsql\bin'
node --check docs/audits/2026-10-18/supplier-discount/prepare-local-fixture.mjs
node docs/audits/2026-10-18/supplier-discount/prepare-local-fixture.mjs
& "$auditPgBin\pg_ctl.exe" -D .local-pg/data-local -l .local-pg/server.txt -o '-h 127.0.0.1 -p 55438' -w start
& "$auditPgBin\createdb.exe" -h 127.0.0.1 -p 55438 -U postgres liftgo_k1_fixture_v3
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v3 -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/local-fixture.generated.sql
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v3 -f docs/audits/2026-10-18/supplier-discount/rpc-acl-regression.sql
# expected exit 3: missing RPC, raw discount already denied
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v3 -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/proposed-supplier-bill-details-rpc.sql
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v3 -f docs/audits/2026-10-18/supplier-discount/rpc-acl-regression.sql
# expected exit 0, 95 PASS
node docs/audits/2026-10-18/supplier-discount/rpc-concurrency.mjs
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v3 -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/local-v3-verification.sql
& "$auditPgBin\pg_ctl.exe" -D .local-pg/data-local -m fast -w stop
& "$auditPgBin\pg_ctl.exe" -D .local-pg/data-local status
# expected status exit 3: no server running
node docs/audits/2026-10-18/supplier-discount/client-proposal/run-temporary-proposal.mjs
git diff --exit-code -- src
git apply --check docs/audits/2026-10-18/supplier-discount/proposed-client.patch
git diff --check origin/main...HEAD -- . ':!*.txt' ':!*.patch'
```

Salida capturada mediante `2>&1 | Tee-Object -FilePath <log indicado>`, con ExitCode en before/after/concurrencia. Se reconstruyó sólo el fixture v3 local al incorporar el helper capturado y el enum real, y se repitió la matriz/concurrencia finales. Las ejecuciones locales necesitaron escalación aprobada; no hubo rechazo de auto-review. Los intentos de preparación del puente con 0 pruebas se conservan en `client-proposal/` y no cuentan como rojo. Ver allí los comandos exactos de Vitest y la restauración en finally.
