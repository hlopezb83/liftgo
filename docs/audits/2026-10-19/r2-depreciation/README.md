# R2: conciliación visual de depreciación

Base: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

## Reproducción y regla

La utilidad descuenta `depreciation`, mientras que la tarjeta sumaba los dos componentes ya redondeados por `useStatementTotals`. El RPC conserva precisión al dividir la depreciación entre renta y ocio (véase `20260831184510_1b4d05fe-419b-47ad-b28e-81791f3b6497.sql`, CTE `depreciation_per_forklift_month`). Esta auditoría no ejecuta SQL.

El caso sintético representa un equipo de MXN 1,000, vida útil de 48 meses, mes completo de 31 días y 3 días rentados. Las pruebas alimentan importes sin redondear a los hooks reales `useStatementTotals`, `useStatementRows` y `useComparisonRows`; no sustituyen esos hooks. La tarjeta y la nota se prueban en el componente real del reporte con datos controlados. Toda la ejecución es offline.

| Importe mostrado | Antes | Después |
| --- | ---: | ---: |
| Depreciación de equipos rentados | 2.02 | 2.02 |
| Depreciación de flota ociosa | 18.82 | 18.82 |
| Ajuste de redondeo | ausente | -0.01 |
| Tarjeta de depreciación total | 20.84 | 20.83 |
| Egresos antes de depreciación | 0.00 | 0.00 |
| Utilidad neta sobre ingresos de 1,000 | 979.17 | 979.17 |

La tarjeta ahora muestra la depreciación canónica. Se incorpora una fila de ajuste sólo cuando la suma de los componentes **mostrados** difiere del total canónico mostrado. No se modifica ningún componente, cálculo de utilidad, categoría de gastos, impuesto ni helper monetario global. La nota aclara que el ajuste no cambia la utilidad.

Cada columna concilia por separado. En un rango de dos meses iguales, los componentes del total se agregan antes de redondear: la corrección del total puede ser +0.01 aunque cada mes requiera -0.01. Se preserva esta agregación existente; no se suman las correcciones mensuales para inventar el total del rango.

## Evidencia y cobertura

`results.json` registra los resultados comparables de los mismos 17 casos sobre producto base y producto corregido, las verificaciones relacionadas y huellas SHA-256. Los archivos JSON completos de Vitest quedan en `.tool-tmp/` del worktree; el resumen comprometido conserva casos y estados sin depender de rutas del equipo.

La cobertura incluye:

- Conciliación de componentes, ajuste y total, sin mutar los datos originales ni cambiar utilidad o egresos.
- Redondeo negativo y positivo, componentes negativos, valores cero y ruido de coma flotante.
- Meses y total del rango; comparativo anual y CSV mensual/comparativo.
- Base Efectivo con depreciación cero y sin ajuste.
- Tarjeta canónica, nota sólo en el contexto visible y controles existentes de margen/avisos.

El PDF recibe las mismas filas de estado/comparación que la tabla y el CSV. Las pruebas existentes del componente PDF forman parte de la suite relacionada; no se afirma una inspección visual ni una generación binaria de PDF nueva.

Comandos (con `TEMP`, `TMP` y `TMPDIR` apuntando a `.tool-tmp`):

```text
node node_modules/vitest/vitest.mjs run src/features/reports/hooks/incomeStatement/__tests__/depreciationPresentation.audit.test.ts src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx --maxWorkers 1
node node_modules/vitest/vitest.mjs run src/features/reports/hooks/incomeStatement src/features/reports/components/reports/incomeStatement src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx src/lib/finance/__tests__/depreciation.test.ts src/lib/pdf/documents/__tests__/IncomeStatementDocument.margins.test.tsx --maxWorkers 1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <los seis archivos de código y pruebas modificados>
git diff --check
```

Para reproducir el antes, mantener los dos archivos de pruebas de este cambio y usar las versiones base de `IncomeStatementReport.tsx`, `statementRowFactories.ts` y `useStatementRows.ts` en un worktree aislado. El helper nuevo no se importa desde esas versiones base. Las regresiones rojas son deliberadas y no se marcan como pendientes ni se excluyen.

Sin navegador, backend publicado, cambios de permisos, migraciones, publicación o fusión. La revisión visual posterior corresponde al operador GUI.
