# K2 — acceso financiero después de un cambio de rol

Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.
Corrección y pruebas: `a932ed6823c84fbc91b19de778d28272bafaddfb`.
Rama: `fix/audit-financial-access-20261018`.

## Cambio

| Archivo y líneas en el SHA corregido | Comportamiento |
| --- | --- |
| `src/features/fleet/hooks/forklifts/useForkliftFinancials.ts:45–73` | Conserva los roles autorizados existentes. Devuelve `data: undefined` en el primer render sin autorización, usa `skipToken` para evitar también refetch manual y cancela/elimina el root `forklift-financials` al perder acceso o quedar el rol sin resolver. La cancelación evita que una respuesta anterior vuelva a escribir datos financieros. |
| `src/features/fleet/pages/ForkliftDetail.tsx:37–40`, `:57`, `:125–128`, `:138–141` | Guard explícito del resumen y del historial de horómetro, incluso si el hook entrega datos cacheados. El permiso del resumen sigue siendo independiente del permiso para ver tarifas/costos. |
| `src/features/fleet/hooks/forklifts/__tests__/useForkliftFinancials.cacheAccess.test.tsx:38–100` | Mismo QueryClient e identidad durante admin → mechanic; purga de otros detalles financieros; conservación de caché operativa; respuesta tardía que ignora cancelación; rol sin resolver; recuperación de autorización con datos frescos; roles autorizados existentes. |
| `src/features/fleet/pages/__tests__/ForkliftDetail.layout.test.tsx:37–49` | Un rerender revoca autorización mientras el mock conserva datos: desaparecen resumen, cifras e historial; se conservan notas. |

No se modificaron `AuthQueryCacheSync`, `IdentityScopedPersistence`, permisos SQL ni la lista de roles autorizados del RPC.

## Evidencia ejecutada

Las pruebas nuevas se añadieron primero, conservando los dos archivos de implementación exactamente como en la base auditada. `before.txt` registra esa ejecución; no es una reproducción sobre datos publicados.

| Ejecución | Resultado | Evidencia |
| --- | --- | --- |
| Misma selección de pruebas antes del arreglo | Exit 1; 4 fallos, 5 pases, 9 pruebas | `before.txt` |
| Misma selección después del arreglo y extracción final del guard | Exit 0; 9 pases | `after.txt` |
| Regresión flota + purgas de usuario/organización | Exit 0; 106 pases, 22 archivos | `regression-tests.txt` |
| ESLint de los cuatro archivos modificados | Exit 0; sin errores ni advertencias | `lint.txt` |
| TypeScript global iniciado en el worktree | Exit 0, sin diagnósticos | `typecheck.txt` |

Los cuatro fallos base fueron datos cacheados visibles tras admin → mechanic, respuesta tardía que restaura datos, datos anteriores con rol sin resolver y resumen/historial visibles en el detalle tras revocar autorización. El caso que conserva los roles autorizados pasó tanto antes como después.

La regresión de 106 pruebas y TypeScript se iniciaron tras el arreglo, antes de extraer el pequeño guard local que evita aumentar la complejidad de `ForkliftDetail`. Después de esa extracción se repitieron las 9 pruebas comparables y ESLint. El coordinador ejecutará tipos/build y validaciones de la integración final.

Comando exacto de comparación antes:

```powershell
node node_modules/vitest/vitest.mjs run src/features/fleet/hooks/forklifts/__tests__/useForkliftFinancials.cacheAccess.test.tsx src/features/fleet/pages/__tests__/ForkliftDetail.layout.test.tsx --maxWorkers=2 2>&1 | Tee-Object -FilePath docs/audits/2026-10-18/financial-access/before.txt; exit $LASTEXITCODE
```

Comando exacto de comparación después:

```powershell
node node_modules/vitest/vitest.mjs run src/features/fleet/hooks/forklifts/__tests__/useForkliftFinancials.cacheAccess.test.tsx src/features/fleet/pages/__tests__/ForkliftDetail.layout.test.tsx --maxWorkers=2 2>&1 | Tee-Object -FilePath docs/audits/2026-10-18/financial-access/after.txt; exit $LASTEXITCODE
```

Comando exacto de regresión:

```powershell
node node_modules/vitest/vitest.mjs run src/features/fleet src/lib/query/__tests__/identityScopedCache.test.tsx src/lib/ui/__tests__/AuthQueryCacheSync.test.tsx --maxWorkers=2 2>&1 | Tee-Object -FilePath docs/audits/2026-10-18/financial-access/regression-tests.txt; exit $LASTEXITCODE
```

Comandos de comprobación estática:

```powershell
node node_modules/eslint/bin/eslint.js src/features/fleet/hooks/forklifts/useForkliftFinancials.ts src/features/fleet/hooks/forklifts/__tests__/useForkliftFinancials.cacheAccess.test.tsx src/features/fleet/pages/ForkliftDetail.tsx src/features/fleet/pages/__tests__/ForkliftDetail.layout.test.tsx
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Entorno: Node `24.19.0`, Vitest `4.1.11`; configuración offline existente en `vitest.config.ts`, URL de Supabase de prueba `http://127.0.0.1:54321`. Los archivos de regresión con nombre `.rls.test.ts` son pruebas con mocks, no verificaciones de privilegios SQL reales.

La creación reversible de la junction local `node_modules` y las ejecuciones Vitest requirieron escalación aprobada: el sandbox inicialmente devolvió `Access is denied` al crear la junction y `EPERM` al renombrar temporales de Vite. No hubo rechazo de auto-review. No se operó Chrome ni se consultó/modificó una base de datos.

## Riesgo condicional fuera del alcance K2

El código revisado sigue solicitando `acquisition_cost`, `insurance_cost` y tarifas en `FORKLIFT_COLUMNS`, compartido por listados y detalle (`src/features/fleet/hooks/forklifts/useForklifts.ts:12–14`, `:27`, `:47`, `:71`). El guard `useCanSeeFinancialCosts` oculta esos datos en la UI y su propio comentario reconoce esta frontera (`src/features/fleet/hooks/useCanSeeFinancialCosts.ts:4–8`). Además, el root operativo `forklifts` está autorizado para persistencia (`src/lib/query/persister.ts:68`).

Las policies SELECT de mechanic, dispatcher, ventas y auditor en `supabase/migrations/20260825223024_4454e2b4-fe50-4daf-b2c3-7638a5fa72f0.sql:26–41` restringen filas por rol y E2E, sin proyectar columnas. Por tanto, **si** el destino publicado mantiene SELECT sobre esas columnas y esas policies, ocultarlas en pantalla no impide recibirlas por API ni conservarlas dentro de las filas operativas cacheadas. Es una evaluación estática condicional; no se verificaron privilegios, RLS ni respuestas del proyecto publicado y no se afirma una explotación en producción.

La corrección K2 no amplía consultas ni cambia permisos. Una revisión separada deberá confirmar privilegios efectivos bajo cada rol/empresa, requisitos de acceso y posibles RPC/proyecciones antes de cambiar esa frontera. Build integrado, QA de navegador y validación de despliegue quedan a cargo del coordinador; no se ejecutaron en este subtrabajo.
