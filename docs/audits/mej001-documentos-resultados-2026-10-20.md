# MEJ-001: documentos de origen desde Resultados

## Estado

Implementación preparada y probada localmente. La activación se autorizó el 2026-10-21: la migración 0117 incorpora únicamente EXECUTE de esta RPC para authenticated. Este cambio local no aplica la migración remota ni publica la mejora; ambos pasos quedan a cargo del integrador después de revisión, CI y preflight. La UI muestra un error recuperable si el endpoint aún no está disponible; nunca presenta ese fallo como cero ni como conciliación correcta.

Base: `24082043f`, con MEJ-002 (`5c028fd72`) como dependencia de interfaz. No cambia manifiesto, lockfile, fórmulas del reporte ni permisos de otras funciones.

## Comportamiento

- Los importes de ingresos por categoría, cliente, mes y total, las notas de crédito y las categorías de gasto abren un inspector paginado (25 movimientos; máximo de servidor 100).
- Folio real cuando existe, tipo de origen, fecha documental, fecha del evento, mes imputado, cobertura del proveedor, moneda original e importe atribuible en MXN.
- Las facturas, sus cobros y notas de crédito abren la ficha de la factura en otra pestaña. Las facturas/pagos de proveedor abren la ficha existente sin salir de Resultados. Los gastos operativos legacy, que no tienen folio/ficha independiente, conservan su registro identificable en un detalle inline.
- El rango completo y la base del reporte se envían intactos. El filtro de mes/año/cliente se aplica después de los CTE canónicos, evitando cambiar la deduplicación de gastos al navegar.
- Total de todas las páginas independiente de la suma de la página. El ajuste de centavos se identifica explícitamente; una diferencia con el importe seleccionado se advierte, no se disimula.
- Un mismo documento con varios pagos o meses de cobertura tiene contribuciones identificables distintas. No se duplica la misma clave de movimiento.
- Cambiar período, año o base cierra el inspector; el cambio de empresa/rol elimina inmediatamente su contenido. Cerrar devuelve el foco al importe de origen o al bloque del reporte.
- No se añaden enlaces a subtotales calculados, comparativos, depreciación o COGS mixto: no son una suma de documentos del alcance implementado. Sus desgloses existentes permanecen.

## SQL y permisos

`0117_income_statement_documents.sql` deriva una función de lectura de los CTE efectivos de `get_income_statement`. Conserva su guardia de roles, clasificación, deduplicación, FX, fechas y aritmética; únicamente propaga identificadores/folios y cambia la proyección final a documentos. No reemplaza ni modifica el reporte original.

La creación falla si el reporte es SECURITY DEFINER, faltan anclas únicas o no existe la deduplicación canónica. La nueva función es SECURITY INVOKER, queda bajo RLS y exige Reportes/read más los módulos de los documentos (Facturas para facturas y su historial de cobros, o Facturas de Proveedor y Gastos para categorías mixtas). Despacho sigue rechazado por la guardia financiera original. No recibe un ID arbitrario de empresa.

La migración revoca ejecución a PUBLIC, anon y authenticated y después concede únicamente EXECUTE de esta RPC a authenticated. No cambia roles, privilegios por defecto, permisos de módulos ni acceso a tablas. Los ACL/defaults reales y cualquier privilegio inesperado se deben revisar antes de la ejecución remota; la prueba local no presupone esos valores. El ensayo comprueba ejecución autenticada, rechazo de anon/PUBLIC y ausencia de nuevos privilegios de tabla; los accesos de tabla de su fixture son exclusivamente locales.

La función comprueba la huella del cuerpo canónico en cada llamada. Si cambia el reporte o vuelve a DEFINER, el detalle falla cerrado y requiere una nueva migración revisada que regenere los CTE; no continúa con cálculos divergentes.

## Verificación

- PostgreSQL desechable con el cuerpo real del reporte más su deduplicación vigente: conciliación en ambas bases, USD/MXN, pagos parciales en meses distintos, notas de crédito por emisión, prorrateo de cobertura, gasto ligado no duplicado, centavos, paginación, RLS entre dos empresas ficticias, rechazo por módulo y rol, ejecución sólo autenticada y rechazo ante cambio de versión/seguridad del origen.
- Pruebas focales de React/Vitest: 51/51 aprobadas (5 archivos, un worker). navegación categoría/cliente/mes, conservar el contexto, cierre y foco, paginación, carga sin filas anteriores, error/reintento, discrepancia de total, moneda, fichas, permisos y cambio de empresa. Regresiones existentes de etiquetas MEJ-002, redondeo y frontera financiera.
- ESLint focal y coherencia del journal Drizzle. Diagnóstico TypeScript focal de ocho módulos cambiados: 0 errores; no sustituye el typecheck global.
- Suite global, typecheck global, build y smoke publicado pendientes del integrador por la pausa de recursos. No se afirma validación visual en producción ni activación remota.

Comandos reproducibles (un worker):

```sh
PG_BIN=/ruta/absoluta/a/postgresql/bin node scripts/tests/reports/income-statement-documents.cjs
node scripts/check-drizzle-journal.ts
vitest run src/features/reports/components/reports/incomeStatement/__tests__/IncomeStatementDocuments.test.tsx src/features/reports/hooks/incomeStatement/__tests__/useIncomeStatementDocuments.test.tsx src/features/reports/components/reports/__tests__/IncomeStatementReport.test.tsx src/features/reports/hooks/incomeStatement/__tests__/depreciationIntlBoundary.audit.test.tsx src/features/reports/pages/__tests__/ReportsPage.financialAccess.test.tsx --maxWorkers=1
```

## Revisión de foco anidado

Se corrigió el retorno de foco al cerrar la ficha de proveedor desde el inspector. La ficha acepta `onCloseAutoFocus` de forma opt-in, sin cambiar el comportamiento de otros llamadores. El inspector resuelve el botón de la contribución actual al cerrar, también después de un refetch; si desapareció, enfoca el inspector conectado en vez de BODY. Cuatro pruebas con ambas hojas Radix reales cubren Cerrar, Escape/reapertura, remonte, fila ausente y folios repetidos. La repetición focal del inspector y estas regresiones aprobó 14/14 pruebas con un solo worker; ESLint focal no reportó advertencias.

## Permisos de cobros

La lectura de cobros usa el contrato vigente de la ficha de Facturas/read, tanto en UI como en SQL. La migración `20260610045321_b660bcd2-d9f2-4c18-bf0f-44f0d187b242.sql` eliminó el módulo Pagos y el catálogo `MODULES` ya no lo incluye; no se agrega ni restaura dicho permiso. La regresión usa el catálogo actual y `getAccessLevel`, y el fixture PostgreSQL usa una matriz sin Pagos con la implementación real de `has_permission`. Se conservan la exclusión financiera, Reportes/read, RLS y la ausencia de nuevos permisos de tablas o módulos. El ensayo PostgreSQL pasó para admin, administrativo y auditor con Facturas/read, verificando además denegaciones de cada módulo, ambos tipos de base y Despacho; la repetición UI/hook/foco aprobó 16/16 pruebas con un worker.
