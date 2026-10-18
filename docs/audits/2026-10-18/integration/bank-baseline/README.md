# Conciliación bancaria: comparación dirigida del fallo del gate

La suite general de integración registró un fallo en `BankReconciliationWorkspace.test.tsx`, caso `J navega fuera de la ventana virtual y al cerrar enfoca el listado sin perder selección ni scroll`, con duración de 5818 ms. La comparación independiente dirigida no reproduce el fallo.

| Estado | SHA | Resultado | Caso señalado | Archivo completo | Evidencia |
| --- | --- | --- | --- | --- | --- |
| Integración | `3e739365438ed92fd78f45276c6c569d9b8930fb` | exit 0, 11/11 pruebas | 3490 ms | 6.92 s | `final-directed.txt` |
| Base auditada | `ec177edf865671a9e9952f5cccd56a9db687f0bd` | exit 0, 11/11 pruebas | 3697 ms | 7.10 s | `base-directed.txt` |

Las ejecuciones fueron secuenciales, con Node `24.19.0`, Vitest `4.1.11`, las mismas dependencias locales y configuración offline versionada. No se ejecutaron suite completa, tipos, build, Chrome o conexiones de BD. No se modificó código de producto, pruebas ni configuración. La suite general del coordinador seguía en curso al registrar esta comparación: la hipótesis de carga/timeout necesita contrastarse con su diagnóstico final y no se presenta como causa demostrada.

El diff entre ambos SHA no modifica `src/features/bank-reconciliation` ni el cuerpo de la tabla compartida. Dos blobs Git comprobados:

| Archivo | Blob idéntico en base e integración |
| --- | --- |
| `src/features/bank-reconciliation/components/__tests__/BankReconciliationWorkspace.test.tsx` | `7a2de158f108d5454577afe668d6ed39ec0150f9` |
| `src/features/bank-reconciliation/components/BankReconciliationWorkspace.tsx` | `c5b615d60764d84e541469327aaecfc42f33eb97` |

## Comandos ejecutados

Preparación desde `liftgo`:

```powershell
git worktree add --detach C:/Users/torta/Documents/Codex/2026-10-18/task-2/audit-baseline ec177edf865671a9e9952f5cccd56a9db687f0bd
```

Preparación desde `audit-baseline`:

```powershell
New-Item -ItemType Junction -Path node_modules -Target C:/Users/torta/Documents/Codex/2026-10-18/task-2/liftgo/node_modules | Out-Null
New-Item -ItemType Directory -Path .vitest-bank-tmp,docs/audits/2026-10-18/bank-baseline -Force | Out-Null
```

La creación inicial de la junction devolvió `Access is denied`; la repetición con escalación local fue aprobada y completó la preparación. No hubo rechazo de aprobación automática.

Integración, directorio `liftgo`:

```powershell
$env:TEMP = 'C:\Users\torta\Documents\Codex\2026-10-18\task-2\audit-baseline\.vitest-bank-tmp'; $env:TMP = $env:TEMP
node node_modules/vitest/vitest.mjs run src/features/bank-reconciliation/components/__tests__/BankReconciliationWorkspace.test.tsx --maxWorkers=2 --reporter=verbose 2>&1 | Tee-Object -FilePath C:/Users/torta/Documents/Codex/2026-10-18/task-2/audit-baseline/docs/audits/2026-10-18/bank-baseline/final-directed.txt
$bankExit = $LASTEXITCODE; Write-Output "EXIT_CODE=$bankExit"; exit $bankExit
```

Base, directorio `audit-baseline`:

```powershell
$env:TEMP = 'C:\Users\torta\Documents\Codex\2026-10-18\task-2\audit-baseline\.vitest-bank-tmp'; $env:TMP = $env:TEMP
node node_modules/vitest/vitest.mjs run src/features/bank-reconciliation/components/__tests__/BankReconciliationWorkspace.test.tsx --maxWorkers=2 --reporter=verbose 2>&1 | Tee-Object -FilePath docs/audits/2026-10-18/bank-baseline/base-directed.txt
$bankExit = $LASTEXITCODE; Write-Output "EXIT_CODE=$bankExit"; exit $bankExit
```

Los dos procesos imprimieron `EXIT_CODE=0`. Los logs preservan la salida de Vitest; el código de salida se verificó también en el resultado de cada proceso.

## Conclusión limitada

Sin regresión reproducible en este archivo con la prueba dirigida. Un pase dirigido no convierte el gate general fallido en un pase ni demuestra ausencia absoluta de flakiness. El coordinador debe conservar ambos resultados y el diagnóstico final del gate; no se propone un arreglo ajeno al alcance de los once hallazgos.
