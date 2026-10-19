# Revisión R2: medio centavo en el CSV

Base de esta corrección: `8e1fb034b8c923c4637fb7219f7d84630329c5f3`.

La revisión detectó un límite no cubierto por la evidencia inicial: pantalla y PDF formatean moneda con `Intl.NumberFormat`, mientras que el CSV usaba `Number.toFixed`. Ambos pueden producir textos distintos al recibir medio centavo exacto. El ajuste de depreciación, calculado para los importes visibles, dejaba entonces de conciliar dentro del CSV.

## Reproducción antes/después

Equipo sintético de MXN 972, vida útil de 48 meses, 3 días rentados en un mes de 30 días. Los inputs conservan precisión: depreciación total 20.25, renta 2.025 y ocio 18.225. Las pruebas llaman a los builders reales y comparan el texto CSV con `formatCell`, que usa el formateador real de pantalla/PDF. No se sustituye el algoritmo con una expectativa derivada de `toFixed`.

| Campo | Pantalla/PDF | CSV antes | CSV después |
| --- | ---: | ---: | ---: |
| Renta | 2.03 | 2.02 | 2.03 |
| Ocio | 18.23 | 18.23 | 18.23 |
| Ajuste | -0.01 | -0.01 | -0.01 |
| Suma de los tres conceptos | 20.25 | 20.24 | 20.25 |
| Utilidad neta sobre ingresos de 1,000 | 979.75 | 979.75 | 979.75 |

También se verifica el signo negativo: `-2.025`, `-18.225` y ajuste `+0.01` deben exportar `-2.03`, `-18.23` y `+0.01`, con suma `-20.25` y utilidad `1020.25`. Se cubren valores mensuales, totales, años y variación comparativa, sin mutar los valores raw originales.

## Alcance del cambio

Se reemplaza sólo el formateo del texto monetario de `buildCsvRows` y `buildComparisonCsvRows` por un `Intl.NumberFormat` local a ese archivo. Conserva punto decimal, dos dígitos y ausencia de separadores de miles o símbolo monetario para mantener el CSV importable. Usar la misma política visible para todos los importes de este reporte evita introducir una excepción exclusiva de depreciación: por ejemplo, `1.005` también debe verse y exportarse como `1.01`.

Porcentajes, `No aplica`, estructura del CSV y claves permanecen iguales. No se cambia ningún importe raw, cálculo de totales, utilidad, impuesto, helper monetario global, SQL o permiso. El helper de ajuste de depreciación y los componentes de pantalla/PDF no se modifican en este seguimiento.

## Verificación

`results.json` conserva los mismos cinco casos antes y después, las verificaciones relacionadas y huellas SHA-256 normalizadas a LF para los archivos de código. Los informes completos de Vitest quedan en `.tool-tmp/depreciation-csv-{before,after,related}.json` del worktree.

```text
node node_modules/vitest/vitest.mjs run src/features/reports/hooks/incomeStatement/__tests__/depreciationCsvHalfCent.audit.test.ts --maxWorkers 1
node node_modules/vitest/vitest.mjs run src/features/reports/hooks/incomeStatement src/features/reports/components/reports/incomeStatement src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx src/lib/finance/__tests__/depreciation.test.ts src/lib/pdf/documents/__tests__/IncomeStatementDocument.margins.test.tsx --maxWorkers 1
node node_modules/eslint/bin/eslint.js src/features/reports/hooks/incomeStatement/statementRowFactories.ts src/features/reports/hooks/incomeStatement/__tests__/depreciationCsvHalfCent.audit.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

`TEMP`, `TMP` y `TMPDIR` apuntan a `.tool-tmp`. Para reproducir el antes, usar el builder de la base indicada con el nuevo archivo de pruebas en un worktree aislado. No se usa navegador, SQL, backend publicado, Facturapi ni servicios externos.
