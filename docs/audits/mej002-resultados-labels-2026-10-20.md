# MEJ-002: moneda, IVA y fechas en Resultados

Base revisada: `24082043f` (main, cierre de los pendientes Vite/QR02/QR07).

## Alcance

Se reemplaza la etiqueta aislada de base contable por una nota de lectura con moneda, IVA, fechas de la base seleccionada y detalle expandible nativo. La ayuda se muestra en vista mensual y comparativa. No cambia importes, redondeos, filtros, argumentos del RPC, permisos ni exportaciones. No hay migraciones, cambios de dependencias ni acciones remotas.

## Reglas contrastadas antes de escribir el texto

La definición completa más reciente de `get_income_statement` está en `supabase/migrations/20260831184510_1b4d05fe-419b-47ad-b28e-81791f3b6497.sql`. Se revisaron también las modificaciones posteriores: `20260901015737` (deduplicación de gastos vinculados), `20260901182145`, `20260902004607` y `20260902005754` (depreciación histórica de equipos archivados), y `drizzle/migrations/0036_multi_org_analytics_rpc_invoker_scope.sql` (SECURITY INVOKER). No sustituyen las reglas de fechas/IVA descritas abajo.

| Partida | Importe e IVA | Devengado | Efectivo |
| --- | --- | --- | --- |
| Facturas | Subtotal, convertido a MXN; efectivo: proporción del subtotal correspondiente a cada cobro | `issued_at` | `payments.payment_date` |
| Notas de crédito | Subtotal convertido con TC de la factura; sólo NC timbradas, no borrador/canceladas ni cancelación aceptada | `credit_notes.issued_at` | La misma emisión; proporción de la suma de todos los cobros de la factura sobre su total, limitada a 1 |
| Facturas de proveedor | Subtotal convertido; efectivo: subtotal × pago/total; si el total no es positivo, se usa el pago convertido sin separar IVA | `issue_date` sin cobertura completa; con cobertura completa se prorratea por días de cada mes | `supplier_payments.payment_date` |
| Gastos operativos | `amount` registrado, sin separación de IVA; conserva deduplicación vigente | `expense_date` | `expense_date` |
| Mantenimiento completado | `cost` registrado, sin separación de IVA | `performed_at` | `performed_at` |
| Daños | `actual_cost`, o `estimated_cost` si falta; sin separación de IVA | `repaired_at`, o `created_at` si falta | Igual |
| Costo automático de equipos vendidos | Valor en libros calculado desde el costo de adquisición registrado; sin separación adicional de IVA | Fecha de la factura de venta | Fecha del cobro de la factura de venta |
| Costo manual de equipos vendidos | Proveedor con categoría `costo_venta`, consolidado por `resolveCogs` sin doble conteo | Criterios de proveedor | Criterios de proveedor |
| Depreciación | Cálculo mensual sobre costo de adquisición registrado, sin separación adicional de IVA | Desde adquisición o creación si no hay fecha de adquisición; conserva reglas de vida útil, venta y archivo | Excluida |

La ponderación de NC en efectivo no limita los cobros al período consultado; por eso la explicación no dice «cobros del período» ni usa fecha de devolución. Las partidas operativas no pasan a fecha de pago al cambiar de base. Por estas razones, la vista efectivo no se presenta como conciliación bancaria.

Moneda: el RPC convierte facturas, proveedores y NC a MXN con los tipos registrados y excluye los documentos en divisa sin el tipo requerido. Los otros costos se toman de sus campos registrados. `src/lib/config.ts` fija `APP_CONFIG.CURRENCY = "MXN"`; `formatCurrency` usa esa configuración.

`src/features/reports/hooks/incomeStatement/useMonthlyData.ts` sólo envía `p_start_date`, `p_end_date`, `p_basis`, mapea el RPC y consolida COGS. `types.ts` y los hooks de totales/filas mantienen los cálculos actuales. Las pruebas existentes de márgenes, depreciación y su presentación/exportación se reutilizan, no se reemplazan.

## Cobertura de presentación

Se amplía `IncomeStatementReport.test.tsx` para verificar MXN, IVA por tipo de partida y excepción de proveedores sin total positivo; fechas en ambas bases; NC por emisión y cobros fuera del período; conservación de importes y argumentos del hook al alternar bases; ayuda en comparativo; y estructura accesible `section`/`details`/`summary`, sin tooltip dependiente del mouse.

La revisión corresponde al código versionado. No se consultó ni modificó la definición efectiva de una base remota.

## Validación local

- `IncomeStatementReport.test.tsx`: 15/15 pruebas pasan sobre el texto final, con un solo worker.
- Otros 16 archivos de reportes y PDF: 105/105 pruebas pasan. La ejecución conjunta original quedó incompleta porque el worker del componente salió inesperadamente; ese archivo se ejecutó después de forma aislada con el resultado anterior. No se presenta la primera corrida como íntegramente exitosa.
- ESLint de los tres archivos de código modificados, `arch:check` y `git diff --check`: pasan.
- Typecheck global: interrumpido con SIGKILL/código 137, sin diagnósticos de TypeScript. Se deja para el integrador en serie después del trabajo de dependencias; no se declara aprobado.
- No se ejecutó un smoke visual en navegador ni se hizo publicación. Las exportaciones no cambian; su cobertura existente de márgenes y redondeo pasó.
