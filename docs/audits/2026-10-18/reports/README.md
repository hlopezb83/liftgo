# N2 y N3 — evidencia local de corrección

- Repositorio: `hlopezb83/liftgo`.
- Base auditada: `ec177edf865671a9e9952f5cccd56a9db687f0bd`.
- Commit de código corregido: `8e59be836eea70ad7a7a4afd14cea7d65eb4d350`.
- Rama: `fix/audit-reports-20261018`.
- Entorno: ASUS/Windows, PowerShell, Node `v24.19.0`, Vitest `4.1.11`.
- Directorio de trabajo: `C:\Users\torta\Documents\Codex\2026-10-18\task-2\audit-reports`.

## Cambios y ubicaciones

| Hallazgo | Archivo y línea del commit corregido | Resultado |
| --- | --- | --- |
| N2 | `src/features/reports/hooks/incomeStatement/types.ts:143` | Los tres márgenes devuelven `null` cuando ingresos netos <= 0. Los cálculos monetarios no cambian. |
| N2 | `src/features/reports/hooks/incomeStatement/types.ts:76`, `src/features/reports/hooks/incomeStatement/useStatementRows.ts:20` | Tipos mensuales, anuales, filas y consumidores admiten el margen no aplicable. |
| N2 | `src/features/reports/components/reports/IncomeStatementReport.tsx:36` | El KPI muestra `No aplica` con color neutral. Un margen válido de cero sigue mostrando `0.0%`. |
| N2 | `src/features/reports/components/reports/incomeStatement/incomeStatementHelpers.ts:7`, `ComparisonTable.tsx:40` | La tabla mensual y comparativa conserva `No aplica`; una variación sin ambos márgenes válidos no se calcula. |
| N2 | `src/features/reports/hooks/incomeStatement/statementRowFactories.ts:128`, `:147`, `:170` | CSV mensual y comparativo conserva la ausencia. Las variaciones entre margen válido/no aplicable son `null`. |
| N2 | `src/lib/pdf/types/incomeStatement.ts:12`, `src/lib/pdf/documents/IncomeStatementDocument.tsx:37` | DTO y texto del documento PDF admiten ausencia sin `toFixed(null)` ni variaciones artificiales. |
| N3 | `src/features/reports/components/reports/IncomeStatementReport.tsx:114` | La advertencia de equipos rentados sin costo para depreciación sólo se muestra en Devengado. La advertencia de equipos vendidos sin costo permanece en ambas bases. |

## Pruebas ejecutadas

Las corridas finales **before** y **after** usan la misma versión de los tres archivos de prueba y el mismo comando. Para **before** se restauraron temporalmente sólo los ocho archivos de producción modificados a la base auditada, con copia de sus bytes actuales y restauración en `finally`. El resto del worktree y los archivos de prueba permanecieron iguales. Se repitió **after** tras recuperar la corrección.

| Comprobación | Resultado ejecutado | Evidencia |
| --- | --- | --- |
| Base + regresiones finales | 3 archivos; 10 fallos, 4 aprobadas; exit 1 | `before-tests.log` |
| Corrección + mismas regresiones | 3 archivos; 14 aprobadas; exit 0 | `after-tests.log` |
| Todos los tests de reportes y componentes PDF | 17 archivos; 94 aprobadas; exit 0 | `reports-regression.log` |
| ESLint de los 12 archivos modificados | 0 errores, 0 advertencias; exit 0 | `lint-final.log` |
| `git diff --check` | exit 0 | Ejecutado antes del commit de código |

Los casos N2 prueban ingresos 0 y -200, costos directos 50, egresos 80 y depreciación 100: la utilidad neta sigue siendo -180/-380 y sólo cambian los márgenes a no aplicables. Cubren también un margen real de 0% con ingresos positivos, KPI, tabla, CSV, comparativos con ausencia en uno o ambos años y texto PDF. Los casos N3 verifican el aviso en Devengado y su ausencia en Efectivo, junto con la conservación del aviso de costo de venta.

La prueba PDF sustituye `@react-pdf/renderer` por elementos DOM: verifica el componente y su texto, **no** un binario PDF generado ni su apariencia en navegador. Vitest mantiene la barrera de red offline de `src/test/setup.ts`; no se usaron datos publicados, navegador, cuentas ni transacciones reales.

### Preparación de entorno usada

Se reutilizaron las dependencias instaladas por el integrador mediante una junction local `node_modules` a `..\liftgo\node_modules`. La creación requirió escalación local y fue autorizada. Los intentos de arranque sin junction o con el TEMP inicial no ejecutaron pruebas; se conservan en `attempts/` y no cuentan como reproducción de hallazgos.

```powershell
$env:TEMP = 'C:\Users\torta\AppData\Local\Temp\liftgo-reports-audit-20261018'
$env:TMP = $env:TEMP
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'
```

### Comando idéntico de regresión before/after

```powershell
node node_modules/vitest/vitest.mjs run src/features/reports/hooks/incomeStatement/__tests__/incomeStatementMargins.audit.test.ts src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx src/lib/pdf/documents/__tests__/IncomeStatementDocument.margins.test.tsx --maxWorkers=2
```

Archivos de prueba:

- `src/features/reports/hooks/incomeStatement/__tests__/incomeStatementMargins.audit.test.ts:6` — N2, 7 casos.
- `src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx:75` — N2 KPI y N3, además de 2 controles existentes.
- `src/lib/pdf/documents/__tests__/IncomeStatementDocument.margins.test.tsx:26` — N2 texto del documento PDF, 2 casos.

El test previo `src/features/reports/hooks/incomeStatement/__tests__/computeDerivedTotals.test.ts:71` se actualizó para exigir `null` en los tres márgenes cuando no hay ingresos, conservando la utilidad -100. Está incluido en la suite ampliada aprobada.

### Comando de suite ampliada

```powershell
node node_modules/vitest/vitest.mjs run src/features/reports src/lib/pdf/documents/__tests__ --maxWorkers=2
```

### Comando de lint

```powershell
$changedFiles = @('src/features/reports/hooks/incomeStatement/types.ts', 'src/features/reports/hooks/incomeStatement/statementRowFactories.ts', 'src/features/reports/hooks/incomeStatement/useStatementRows.ts', 'src/features/reports/components/reports/incomeStatement/incomeStatementHelpers.ts', 'src/features/reports/components/reports/incomeStatement/ComparisonTable.tsx', 'src/features/reports/components/reports/IncomeStatementReport.tsx', 'src/lib/pdf/types/incomeStatement.ts', 'src/lib/pdf/documents/IncomeStatementDocument.tsx', 'src/features/reports/hooks/incomeStatement/__tests__/computeDerivedTotals.test.ts', 'src/features/reports/hooks/incomeStatement/__tests__/incomeStatementMargins.audit.test.ts', 'src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx', 'src/lib/pdf/documents/__tests__/IncomeStatementDocument.margins.test.tsx')
node node_modules/eslint/bin/eslint.js @changedFiles
```

## Pendiente de integración

`node node_modules/typescript/bin/tsc --noEmit` se inició y se interrumpió por coordinación con el integrador para evitar varias compilaciones globales simultáneas. No tiene resultado local válido; véase `typecheck-deferred.log`. El integrador realizará typecheck y build globales sobre la rama integrada. El build de esta corrección no se ejecutó en este worktree. La validación del despliegue y QA publicado corresponden al coordinador.

Los archivos de `attempts/` preservan intentos previos y su resolución: el primer after detectó una expectativa nueva de guion ASCII que se ajustó al em dash ya usado por el CSV; el primer lint advirtió complejidad y se resolvió extrayendo el formateador del KPI. Ambos se reejecutaron con éxito en los logs finales indicados arriba.
