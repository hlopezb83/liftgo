# K1: permiso de descuento, propuesta pendiente de aprobación

Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.

El formulario incluye `discount` tanto al crear como al editar (`useSupplierBillForm.ts`, payload de `onSubmit`); `useUpdateSupplierBill` transmite ese patch. La migración `20260729204701_a3db1c09-d144-4423-8e0b-4d9ed5a8909f.sql`, líneas 150–158, retira UPDATE de tabla y concede una lista de columnas sin `discount`. La columna fue añadida después, por `20260811185738_a6781c40-01f6-4e66-8861-407aa6eba1fc.sql`. Por ello incluso editar otro campo con descuento sin cambios puede fallar.

La propuesta completa mínima está en `proposed-discount-grant.sql`:

```sql
GRANT UPDATE (discount) ON public.supplier_bills TO authenticated;
```

No se modificó el formulario para eliminar `discount`: hacerlo cuando cambia el total dejaría datos inconsistentes. Omitir sólo el valor numéricamente idéntico sería una mitigación parcial y no permitiría editar un descuento real. No se conceden UPDATE global ni columnas de aprobación, ni se cambian RLS, RPCs o roles.

## Destinos y alcance de la evidencia

- **Único destino usado:** PostgreSQL 17.9 efímero en `127.0.0.1:55438`, base `liftgo_k1_fixture`, cluster `audit-supplier-discount/.local-pg/data-local`, propietario local `postgres`. Sin contraseña ni cuentas reales; acceso trust sólo por loopback durante la prueba. Servidor detenido al terminar.
- El `.env` versionado identifica **como candidato por confirmar** el proyecto `zxefrzfaynnfwazqhwxp`, URL `https://zxefrzfaynnfwazqhwxp.supabase.co`. No se abrió conexión a él. No se verificó que corresponda a la publicación auditada ni su ACL actual. El coordinador debe confirmar el proyecto/base exacto y obtener aprobación específica antes de aplicar el SQL.
- `prepare-local-fixture.mjs` extrae sin reescribir las policies de CxP, el GRANT histórico, el guard de aprobación y los helpers de rol/organización del código auditado. PostgreSQL ejecuta los tests con **SET LOCAL ROLE authenticated**, claims sintéticos y dos empresas. `local-fixture.generated.sql` conserva el SQL exacto ejecutado.
- **Límite:** es un subconjunto real de esquema/ACL/RLS, no una reconstrucción de todas las migraciones Supabase. Omite triggers ajenos al control de acceso (recalculado, auditoría, pagos, umbral de aprobación, etc.). No demuestra el estado publicado ni sustituye las suites completas de Supabase y la verificación posterior en el destino aprobado. No es un mock de formulario.

## Resultado ejecutado

Mismo `discount-acl-regression.sql` antes y después:

| Estado | Resultado |
| --- | --- |
| Base con ACL histórica | `psql` exit 3: `permission denied for table supplier_bills` al editar descuento y total como authenticated/admin (`before.txt`) |
| Propuesta aplicada sólo al fixture | `psql` exit 0, 12 comprobaciones pasan, transacción ROLLBACK (`after.txt`) |

Positivos: admin y administrativo editan descuento junto al total. Negativos: ventas, auditor, mechanic, dispatcher, customer, usuario inactivo, sin membresía, admin de otra empresa y admin A sobre fila B. Aprobación directa sigue denegada; `has_table_privilege(...,'UPDATE')` es false, permiso de `discount` true y permiso de `approval_status` false. Snapshot de destino/ACL/policies: `local-target-and-acl.txt`.

## Comandos exactos (PowerShell, desde este worktree)

```powershell
$pg = 'C:\Users\torta\Documents\Codex\tooling\postgres-17.9\extract\pgsql\bin'
& "$pg\initdb.exe" -D .local-pg/data-local -U postgres -A trust --locale=C -E UTF8
& "$pg\pg_ctl.exe" -D .local-pg/data-local -l .local-pg/server.txt -o '-h 127.0.0.1 -p 55438' -w start
node docs/audits/2026-10-18/supplier-discount/prepare-local-fixture.mjs
& "$pg\createdb.exe" -h 127.0.0.1 -p 55438 -U postgres liftgo_k1_fixture
& "$pg\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/local-fixture.generated.sql
& "$pg\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture -f docs/audits/2026-10-18/supplier-discount/discount-acl-regression.sql
# expected before exit 3; only this disposable database receives the proposal:
& "$pg\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture -v ON_ERROR_STOP=1 -f docs/audits/2026-10-18/supplier-discount/proposed-discount-grant.sql
& "$pg\psql.exe" -h 127.0.0.1 -p 55438 -U postgres -d liftgo_k1_fixture -f docs/audits/2026-10-18/supplier-discount/discount-acl-regression.sql
# after exit 0
& "$pg\pg_ctl.exe" -D .local-pg/data-local -m fast -w stop
```

La inicialización en sandbox quedó detenida al crear procesos y se terminó; la nueva inicialización y los comandos SQL locales necesitaron escalación, autorizada por revisión automática. Ninguna revisión rechazó una acción. No se ejecutaron migraciones ni GRANT en base publicada. La propuesta vive fuera de los directorios de migraciones automáticas.

## Pendiente, no ejecutado

Confirmar destino y ACL/RLS actuales por lectura autorizada; revisión del coordinador; aprobación específica del usuario; convertir esta propuesta a migración forward-only para el carril elegido; probar reconstrucción completa y suite real de roles/empresas/aprobación; publicación coordinada y QA. El código de producción no queda corregido para K1 hasta aplicar el permiso mínimo en ese destino aprobado.
