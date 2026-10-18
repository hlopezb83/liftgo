# K1 — propuesta de permiso de descuento, todavía no cerrada

Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`. Primera evidencia: `f10c35a2b60d6fde812cdafbebe00af79ea1c795`; la ampliación v2 corresponde al commit que contiene este documento.

**La v1 queda supersedida como evidencia de fidelidad a la política actual.** Usaba `has_role(admin) OR has_role(administrativo)` y afirmaba bloqueo de un perfil inactivo. Los metadatos actuales muestran que la policy utiliza `is_admin_or_administrativo()`, cuyo cuerpo no consulta `is_active_user`. La v2 reproduce ese helper y comprueba que un perfil sintético inactivo con rol admin y membresía válida **sí puede editar**. Se retira la conclusión contraria de v1. Sus logs originales se conservan sin alterar en `historical-v1/`; su generador y SQL originales siguen en el commit `f10c35a2b`.

**Consideración de seguridad antes de aprobar el SQL:** el GRANT habilita también actualizaciones de sólo `discount`. Los triggers actuales de aprobación/monto no vigilan ese campo: en el fixture fiel a esas definiciones, `discount` aislado puede cambiar en facturas aprobadas, parciales o pagadas sin cambiar `total`, `balance` ni estado. SQL tampoco impone `discount <= subtotal` ni la relación aritmética entre descuento y total. No se añaden guardas nuevas en esta propuesta ni se presenta K1 como cerrado.

## Propuesta sin cambios

El formulario siempre incluye `discount` al editar y la mutación transmite el patch. La ACL histórica de `20260729204701_a3db1c09-d144-4423-8e0b-4d9ed5a8909f.sql:150–158` omite esa columna, añadida después por `20260811185738_a6781c40-01f6-4e66-8861-407aa6eba1fc.sql`. Los metadatos actuales confirman `discount_update=false`, `total_update=true`, UPDATE global y columnas de aprobación false.

`proposed-discount-grant.sql` permanece exactamente igual, fuera de los directorios de migraciones automáticas:

```sql
GRANT UPDATE (discount) ON public.supplier_bills TO authenticated;
```

No se elimina `discount` del formulario ni se modifica el patch: omitir sólo valores idénticos sería una mitigación parcial; quitarlo mientras cambia el total produciría inconsistencias. No se conceden UPDATE global ni columnas de aprobación. El único GRANT ejecutado fue sobre la base sintética local.

## Destinos y fuentes

- Pruebas v2: PostgreSQL 17.9 **local**, `127.0.0.1:55438`, base `liftgo_k1_fixture_v2`, cluster `.local-pg/data-local`, propietario sintético/local `postgres`. Es una base nueva, separada del fixture v1 `liftgo_k1_fixture`. Servidor detenido al terminar: `local-stop-v2.txt`.
- Lecturas remotas realizadas **por el coordinador** mediante el conector existente: proyecto Lovable **Lift GO**, ID `e25ace4a-172e-4082-a037-00473dacf2f2`, SHA asociado `ec177edf...`, backend habilitado Supabase, base `postgres`; observaciones del 18/10/2026 a las 22:16 UTC. Son SELECT de catálogo, sin datos de negocio, credenciales ni cambios. Se conservan en `remote-current-acl.json`, `remote-current-guards.json`, `remote-current-business-guards.json`.
- Esa asociación de metadatos no se deduce del `.env` ni prueba por sí sola qué publicación está usando el navegador. Antes de una aplicación publicada, el coordinador debe confirmar el carril y destino de despliegue y obtener aprobación específica.
- Este subtrabajo no abrió conexiones remotas, operó Chrome, publicó ramas ni ejecutó migraciones o permisos en bases reales.

## Fidelidad y límites del fixture v2

`prepare-local-fixture.mjs` no conecta a ninguna base: genera `local-fixture.generated.sql`. Usa DDL real del repositorio y las definiciones exactas capturadas del catálogo para **5 helpers, 9 funciones de protección y 10 triggers de supplier_bills**, además de las 3 policies actuales y sus 12 constraints. Reproduce ENABLE/FORCE RLS. Incluye el CHECK real `supplier_bills_discount_non_negative_chk` y helpers de empresa/rol observados, sin insertar una comprobación de perfil activo que la policy actual no contiene.

Las funciones auxiliares `today_mty`, `fx_is_missing`, inicialización de balance y `recalc_supplier_bill` se extraen sin reescribir del SQL versionado. Los seeds de aprobado/pagos se preparan sólo como dueño de la base sintética, con contexto de servicio local; las pruebas posteriores usan **SET LOCAL ROLE authenticated**, claims sintéticos y `app.cxp_rpc`, `app.cxp_recalc`, `app.audit_revert` explícitamente `off`. Se verifican valores mediante SELECT después de UPDATE, no sólo ROW_COUNT.

Referencias de los guards versionados que coinciden con las capturas:

| Función / activación | Fuente |
| --- | --- |
| Helper admin/administrativo sin `is_active_user` | `20260811213504_b2fd5e74-952c-4863-8a8e-2c87072af28f.sql:46–58` |
| `discount >= 0` | `20260811185738_a6781c40-01f6-4e66-8861-407aa6eba1fc.sql:1–8` |
| Umbral por empresa, retorno si monto equivalente, bloqueo por pagos y aprobación | `drizzle/migrations/0018_multi_org_phase6_supplier_approval_scope.sql:9–110` |
| Trigger de aprobación: INSERT o UPDATE OF total/currency/exchange_rate, sin discount | `20260831053713_aec36e84-961b-4007-b757-c6033149babe.sql:326–328` |
| Guard de columnas de aprobación | `20260901175006_344ca933-f8f1-4405-85a0-a5ad98e07ca4.sql:153–170` |
| Salida de paid con pagos; bypass de recálculo | `20260826022332_a8aa9c45-6eef-4133-ab3c-646fce2e594d.sql:57–81` |
| Total cubre pagos y balance al cambiar total | `20260729170257_3e7029d2-015d-4b0a-a888-25ebbd0ec401.sql:152–169`; `20260719162221_ea2dab4e-59f3-4c67-9fbd-725e2ba7f496.sql:5–22` |

**Fidelidad parcial, no reconstrucción completa de Supabase.** Se omiten 5 triggers del snapshot de bills: auditoría, vencimiento automático, log de solicitud de aprobación, numeración y updated_at. Las tablas auxiliares de identidad/configuración conservan sólo las columnas necesarias. Las policies de lectura de `supplier_payments` provienen del esquema histórico versionado y de aislamiento de empresa; no se verificó todo su catálogo actual ni se prueban pagos como usuario inactivo. Los pagos son seeds locales: no se ejecuta ni se valida el flujo completo de registro/REP/batches. Las ramas de otras entidades dentro de `validate_transition` no se ejercitan. No se verifican PostgREST, JWT reales ni revocación de sesiones. Los resultados caracterizan este subconjunto y las definiciones capturadas; no son transacciones ni pruebas de explotación sobre datos publicados.

## Resultado ejecutado: mismo SQL antes y después

| Estado | Resultado | Archivo |
| --- | --- | --- |
| ACL sin permiso de discount, igual al permiso observado | psql exit **3** en el primer UPDATE authenticated/admin: permission denied | `before-v2.txt` |
| Sólo propuesta aplicada al fixture | psql exit **0**, **22 PASS + 3 LIMIT**, final ROLLBACK | `after-v2.txt` |
| Snapshot local después del ROLLBACK | RLS enabled/forced true, discount true, total true, global/aprobación false; seeds intactos | `local-target-and-acl-v2.txt` |
| Generador | `node --check` exit 0; generación ejecutada | `prepare-local-fixture.mjs` |

Los 22 PASS verifican: admin 0→10→0 y total/balance 100→90→100; administrativo 20/80/80; descripción con descuento/total idénticos; siete actores denegados (ventas, auditor, mechanic, dispatcher, customer, sin membresía y admin B sobre A); persistencia intacta tras intentos denegados; admin A bloqueado sobre B; aprobación directa sin privilegios; descuento negativo rechazado **por nombre del CHECK real**; cambio efectivo de descuento+total bloqueado en aprobadas y con pagos; descripción permitida conservando importes; balance parcial 80 con pago 20 y pagada 0 con pago 100; candado de salida de paid con pagos. Las excepciones de negocio comprueban también el mensaje real para evitar atribuir un rechazo a otro guard.

Los **3 LIMIT son observaciones que deben revisarse antes de aprobar**, no protecciones:

1. Descuento 110 con subtotal 100 y total no negativo 0 persiste en SQL. El esquema de formulario sí tiene una validación `discount > subtotal` (`useSupplierBillForm.ts:54`), revisada estáticamente; no se ejecutaron pruebas nuevas de frontend en este subtrabajo.
2. Editar sólo discount persiste en aprobada/parcial/pagada. Enviar total idéntico también entra en el retorno temprano del guard de aprobación; no se afirma que todo cambio de TC quede bloqueado, porque ese guard compara montos convertidos y `fx_is_missing`.
3. Perfil inactivo con rol admin y membresía válida puede editar bajo el helper actual. Esto corrige la afirmación de v1, sin ampliar el alcance con cambios de permisos o cuentas.

## Comandos reproducibles (PowerShell, desde este worktree)

```powershell
$auditPgBin = 'C:\Users\torta\Documents\Codex\tooling\postgres-17.9\extract\pgsql\bin'
node --check docs/audits/2026-10-18/supplier-discount/prepare-local-fixture.mjs
node docs/audits/2026-10-18/supplier-discount/prepare-local-fixture.mjs
& "$auditPgBin\pg_ctl.exe" -D .local-pg/data-local -l .local-pg/server.txt -o '-h 127.0.0.1 -p 55438' -w start
& "$auditPgBin\createdb.exe" -h 127.0.0.1 -p 55438 -U postgres liftgo_k1_fixture_v2
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v2 -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/local-fixture.generated.sql
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v2 -f docs/audits/2026-10-18/supplier-discount/discount-acl-regression.sql
# expected exit 3; only this disposable local database receives the proposal:
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v2 -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/proposed-discount-grant.sql
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v2 -f docs/audits/2026-10-18/supplier-discount/discount-acl-regression.sql
# expected exit 0, 22 PASS and 3 LIMIT:
& "$auditPgBin\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture_v2 -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/local-v2-verification.sql
& "$auditPgBin\pg_ctl.exe" -D .local-pg/data-local -m fast -w stop
git diff --check
```

Los logs se capturaron con `2>&1 | Tee-Object -FilePath <archivo indicado>`; before/after incluyen `ExitCode`. La primera preparación v2 falló por orden de dependencias (`has_role` antes de `is_active_user`); se conserva `setup-v2-initial-failure.txt`. Se corrigió el orden, se recreó **sólo** esa nueva base local y la preparación terminó exit 0 (`setup-v2.txt`). Los comandos locales requirieron escalación aprobada; no hubo rechazo de auto-review.

## Pendiente, no ejecutado

Revisar los tres límites con el coordinador y decidir si el GRANT aislado cumple la frontera deseada; confirmar destino/carril de publicación; aprobación específica del usuario; convertir la propuesta revisada a migración forward-only; reconstrucción completa de Supabase y pruebas de roles/empresas/estados en ese entorno autorizado; aplicación y QA coordinados. No se ejecutaron build/lint/tipos de aplicación en este cambio exclusivamente de fixture y evidencia; la validación integrada del código corresponde al coordinador.
