# K1v3: propuesta cliente ejecutada con parche temporal

**Estado:** propuesta revisable, fuera del código activo. Se ejecutaron pruebas con el parche aplicado temporalmente en `audit-supplier-discount`; después se restauraron ambos archivos de aplicación y se eliminó el test temporal de `src` en `finally`. No hay commit de aplicación, push, PR, despliegue ni llamada a base de datos en este subtrabajo.

Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`. HEAD local durante la comparativa: `4a5ec92578d8e8eca87af7b610c900d6aabec34d`. Los dos archivos de aplicación examinados son idénticos a la base auditada; `git diff --exit-code ec177edf865671a9e9952f5cccd56a9db687f0bd -- src/features/accounts-payable/hooks/useSupplierBillMutations.ts src/lib/rpc.ts` terminó exit 0. No existe un SHA corregido activo: el entregable es [proposed-client.patch](../proposed-client.patch), SHA-256 `00448bf60916efb9ec4dc79291176c2f0a119b7038c152a437d88fa7200b0cf8`.

## Cambio propuesto

- `src/features/accounts-payable/hooks/useSupplierBillMutations.ts:51`: sustituir `supabase.from("supplier_bills").update(patch).eq("id", id)` por `callRpc<string>("update_supplier_bill_details", { p_bill_id: id, p_patch: patch })`. El descuento y el resto del patch llegan a la validación del servidor. No hay fallback a UPDATE directo. Se mantienen `invalidateKeys`, mensajes de éxito/error y el recálculo de balance en servidor.
- `src/lib/rpc.ts:13`: añadir `"update_supplier_bill_details"` a la unión `RpcName`, siguiendo la ampliación existente para RPC pendientes de tipos generados. No se modifica `src/integrations/supabase/types.ts` ni se afirma validación estática de los argumentos/retorno SQL: `callRpc` recibe un registro y estrecha el retorno genéricamente, igual que antes.
- Test nuevo propuesto: `src/features/accounts-payable/hooks/__tests__/useUpdateSupplierBill.rpc.test.tsx`, conservado aquí como [archivo copiable](useUpdateSupplierBill.rpc.test.tsx). El patch también lo incluye.

El coordinador debe aplicar esta propuesta sólo junto a la RPC revisada y autorizada. El código activo aún utiliza el UPDATE previo. La RPC no se creó ni se invocó contra un backend desde estas pruebas.

## Resultado realmente ejecutado

Misma prueba nueva, mismo comando, fuente original primero y parche temporal después:

| Estado | Resultado | Evidencia |
| --- | --- | --- |
| Antes, fuente original | **exit 1: 2 failed, 1 passed** | [before.txt](before.txt) |
| Después, parche temporal | **exit 0: 3 passed** | [after.txt](after.txt) |
| Restauración | SHA-256 iguales para ambas fuentes; test temporal ausente; diff y status de `src` vacíos | [restoration.json](restoration.json) |
| Aplicabilidad del patch tras restaurar | `git apply --check` **exit 0** | [restoration.json](restoration.json) |

Las dos pruebas rojas comprueban el contrato de transporte ausente: la fuente original no llama a la RPC y, por ello, tampoco observa el rechazo configurado para esa RPC. El mock del UPDATE antiguo responde con éxito deliberadamente para que la falla sea del contrato, no de un mock incompleto. Esto **no reproduce permisos SQL ni una transacción publicada**.

La prueba verde de control, antes y después, verifica que invalidar `supplierBillKeys.all` marca lista y detalle como inválidos, conserva una caché ajena y emite el mismo mensaje de éxito. La prueba de error después comprueba que la misma instancia del error devuelto por el mock llega al consumidor y al feedback, sin invalidación, éxito ni fallback al UPDATE.

Se ejercitan el `callRpc` y el `useEntityMutation` reales; sólo se simulan `supabase.rpc`, `supabase.from` y el feedback. El payload contiene los 18 campos del formulario, incluido descuento, total y nulos opcionales. La configuración real de Vitest fija Supabase a loopback y bloquea fetch real; no se levantó ningún backend.

## Comandos exactos

PowerShell, desde `C:\Users\torta\Documents\Codex\2026-10-18\task-2\audit-supplier-discount`:

```powershell
# Sólo se reutilizan dependencias locales ya instaladas; no hay instalación.
New-Item -ItemType Junction -Path 'node_modules' -Target 'C:\Users\torta\Documents\Codex\2026-10-18\task-2\liftgo\node_modules'
node --check docs/audits/2026-10-18/supplier-discount/client-proposal/run-temporary-proposal.mjs
node docs/audits/2026-10-18/supplier-discount/client-proposal/run-temporary-proposal.mjs
git diff --exit-code -- src
git status --short -- src
git apply --check docs/audits/2026-10-18/supplier-discount/proposed-client.patch
```

El [harness](run-temporary-proposal.mjs) copia temporalmente la prueba a `src`, ejecuta **antes**, aplica en memoria los dos cambios de fuente, genera el patch y ejecuta **después**. Su `finally` restaura las fuentes desde sus buffers originales y elimina sólo el archivo de test que acaba de crear; se niega a sobrescribir un test existente o fuentes con cambios locales. Comprueba hashes, diff/status de `src` y aplicabilidad del patch tras la restauración.

Comando de Vitest registrado dentro de ambos logs:

```powershell
node node_modules/vitest/vitest.mjs run src/features/accounts-payable/hooks/__tests__/useUpdateSupplierBill.rpc.test.tsx --pool=forks --maxWorkers=1
```

Ejecución reproducible con parche temporal y restauración: harness **exit 0**. La junction local permanece fuera del control de versiones. Los checks finales están también en [verification.txt](verification.txt).

## Preparación y límites

La creación normal de la junction recibió `Access is denied`; la misma operación local acotada fue autorizada con escalación y terminó correctamente. No hubo rechazo de auto-review. El primer intento de ejecución usó `--minWorkers=1`, opción no admitida por Vitest 4.1.11; no ejecutó pruebas y se conservan los logs `sandbox-attempt-*`. Se corrigió el comando. El siguiente intento normal encontró `EPERM` al renombrar la caché temporal de Vite, con **0 pruebas ejecutadas**; se conservan `vite-sandbox-attempt-*`. Ninguno de esos intentos cuenta como prueba roja. La comparativa útil `before.txt` / `after.txt` se ejecutó con escalación offline acotada. Los tres intentos restauraron las fuentes; sus JSON lo documentan.

Este subtrabajo no ejecutó TypeScript, build global, lint global, navegador ni permisos SQL. La prueba valida el puente cliente y su comportamiento de caché/error; las políticas, invariantes, concurrencia y permisos de la RPC requieren la evidencia SQL independiente y la revisión del coordinador. El coordinador añadió después comprobaciones del patch temporal sobre main fusionado: [ESLint, TypeScript y 3/3 pruebas](integrated-checks/README.md), con fuentes restauradas. Todo permanece como artefactos documentales; no hay código activo de la propuesta.
