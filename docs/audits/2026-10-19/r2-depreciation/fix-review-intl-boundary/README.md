# Revisión R2: límites inmediatamente alrededor del medio centavo

Base de este seguimiento: `d3960e6fe96f54d3541871a1cb4d1104a1f6afd3`.

La revisión encontró una segunda frontera: el helper de ajuste obtenía centavos mediante `roundMoney`/`currency.js`, que realiza un redondeo intermedio antes del redondeo monetario final. Un valor apenas menor a medio centavo podía terminar contando un centavo que el formateador visible `Intl.NumberFormat` no muestra. Esto añadía un ajuste cuando los componentes visibles ya conciliaban.

| Caso positivo | Total visible | Renta visible | Ocio visible | Ajuste antes | Suma antes | Ajuste después | Suma después |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Total 100; renta 50.0049999; ocio 49.9950001 | 100.00 | 50.00 | 50.00 | -0.01 | 99.99 | ausente | 100.00 |
| Fórmula RPC descrita abajo | 31.15 | 1.00 | 30.15 | -0.01 | 31.14 | ausente | 31.15 |

El caso de origen RPC usa adquisición **46,358.63 MXN**, vida de 48 meses, mes de 31 días, 1 día activo y 1 día rentado. Se deriva de la fórmula existente de `depreciation_per_forklift_month` en `20260831184510_1b4d05fe-419b-47ad-b28e-81791f3b6497.sql`:

```text
total   = (46358.63 / 48) * (1 / 31) = 31.15499327956989
rentada = total * (1 / 31)           = 1.004999783211932
ociosa  = total * (1 - 1 / 31)       = 30.149993496357958
```

No se ejecuta SQL ni se consulta un RPC real: son inputs sintéticos derivados de su fórmula y enviados a los builders/componentes reales del reporte.

## Corrección y límites

El texto decimal visible se centraliza en `statementAmountPresentation.ts`, con un único formateador `Intl.NumberFormat` de dos decimales, punto decimal y sin agrupación. CSV y helper de ajuste consumen ese mismo texto. El helper cuenta los centavos **ya visibles**; no llama a `roundMoney` ni aplica un redondeo monetario previo.

Los componentes HTML y PDF conservan su formateador monetario real basado en Intl. Las pruebas verifican su salida, además de CSV y helper. El documento PDF y sus componentes/formateadores ejecutan realmente; sólo los primitivos de dibujo de `@react-pdf/renderer` se sustituyen por elementos DOM para inspeccionar el texto. No se afirma una generación binaria ni inspección visual del PDF.

No se modifican la política monetaria global, los datos originales, las agregaciones financieras, la depreciación canónica, la utilidad, los impuestos ni el comportamiento de permisos. Los importes sintéticos positivos conservan utilidades de 900.00, 968.85 y 979.75; sus contrapartes negativas conservan 1100.00, 1031.15 y 1020.25.

## Evidencia

La matriz contiene 16 casos: cuatro fronteras × dos signos × mensual/comparativo. Incluye valores inmediatamente inferiores y superiores al medio centavo, el caso RPC y el medio centavo exacto como control. Cada caso comprueba los centavos sumados en HTML, CSV y componente PDF; el comparativo comprueba año y variación. Se verifica también que sólo exista la fila de ajuste cuando corresponda y que los inputs permanezcan intactos.

Los mismos casos producen **4 PASS / 12 FAIL antes** y **16/16 PASS después**. Los cuatro controles de medio centavo exacto ya pasaban antes. La suite relacionada completa queda en **85/85 PASS**. ESLint no emite avisos, `tsc --noEmit` y `git diff --check` pasan.

`results.json` contiene casos y estados antes/después, hashes de los informes completos y hashes de código normalizados a LF. Los informes originales están en `.tool-tmp/depreciation-intl-{before,after,related}.json` del worktree.

```text
node node_modules/vitest/vitest.mjs run src/features/reports/hooks/incomeStatement/__tests__/depreciationIntlBoundary.audit.test.tsx --maxWorkers 1
node node_modules/vitest/vitest.mjs run src/features/reports/hooks/incomeStatement src/features/reports/components/reports/incomeStatement src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx src/lib/finance/__tests__/depreciation.test.ts src/lib/pdf/documents/__tests__/IncomeStatementDocument.margins.test.tsx --maxWorkers 1
node node_modules/eslint/bin/eslint.js src/features/reports/hooks/incomeStatement/statementAmountPresentation.ts src/features/reports/hooks/incomeStatement/depreciationPresentation.ts src/features/reports/hooks/incomeStatement/statementRowFactories.ts src/features/reports/hooks/incomeStatement/__tests__/depreciationIntlBoundary.audit.test.tsx
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Para reproducir el antes, mantener el archivo nuevo de pruebas y usar las versiones base de `depreciationPresentation.ts` y `statementRowFactories.ts` en un worktree aislado. `TEMP`, `TMP` y `TMPDIR` apuntan a `.tool-tmp`. Sin navegador, backend publicado, llamadas externas, migraciones, push, publicación o fusión.
