# MEJ-003: recorrido demo de sólo lectura

## Alcance YAGNI

El botón **Recorrido demo** del Panel abre un diálogo de tres pasos:

1. Documento existente: folio, cliente, fecha de emisión y total.
2. Cobros y saldo: resultado esperado del escenario Pagado, Parcial o Pendiente.
3. Resultados: meses de emisión/cobro, advertencia sobre IVA, moneda y alcance
   del reporte, y enlaces de consulta a factura/Resultados en otra pestaña.

No agrega rutas, tablas, roles, permisos, RPC, dependencias ni migraciones.
Elegir, iniciar, retroceder, reiniciar y salir sólo cambian estado React. Cerrar
con X o salir desmonta la sesión, devuelve el foco al botón y descarta su
selección. No conserva estado en localStorage, URL ni base de datos. Cambiar
usuario o empresa remonta la sesión sin mostrar los documentos anteriores.

El lanzador sólo se monta para Admin interno, con organización verificada y
lectura de Facturas y Reportes. El portal Cliente permanece igual; no se amplía
la visibilidad de otros roles ni se toca el alta de equipo, que sigue bajo sus
controles actuales.

## Criterio de evidencia

No se encontró en el repositorio un catálogo vigente de tres fixtures de demo
con identidad de empresa verificable. Las fotografías históricas de Resultados
no prueban el estado actual de una factura. Por eso no se incluyen UUID ni folios
fijos de una empresa, y no se crean registros al abrir el recorrido.

El presentador introduce un **folio exacto existente**. La consulta se acota a la
organización activa y sigue sometida a RLS. Se exige:

- Una única factura de esa organización y cliente cuyo nombre documental
  contenga QA o DEMO como palabra, no una coincidencia dentro de otro nombre.
  Esta marca es una convención de fixtures, nunca una autorización de acceso.
- Factura no E2E, no borrador/cancelada, con total positivo. No se admiten CFDI
  live; si está timbrada, su entorno debe ser `test` (Sandbox).
- Sin notas de crédito timbradas vigentes. El recorrido sencillo no presenta
  un saldo liquidado con crédito como si fuera cobro.
- Lectura completa de pagos por factura y empresa; la paginación continúa
  hasta una página vacía para no ocultar cobros por el límite del servidor.
- Conversión de cobros mediante el helper monetario existente, sin tratar FX
  faltante o importes inválidos como cero.
- Pagado: estado `paid`, cobros positivos y saldo exactamente cero.
- Parcial: estado `partial`, cobros positivos y saldo mayor que cero.
- Pendiente: estado `sent` u `overdue`, sin pagos y saldo igual al total.

Si falta cualquiera de estas condiciones, se explica que falta un ejemplo
verificable, sin mostrar enlaces de otra empresa ni crear datos. Un fallo de
consulta se distingue de un ejemplo faltante. Durante carga o error no se
muestran importes/documentos anteriores. Las lecturas son una comprobación
puntual, no un bloqueo transaccional de los documentos ni una certificación
contable; cambios posteriores requieren nueva verificación.

La consulta usa `invoices`, `credit_notes` y `payments`, todas de lectura, con
filtro explícito de organización además de RLS. No invoca operaciones fiscales
ni depende del RPC nuevo de MEJ-001. La última etapa permite usar el desglose
documental si está disponible en Resultados, pero siempre conserva el enlace
a la factura como alternativa.

## Comprobación de aceptación

1. Admin: abrir desde Panel, elegir cada escenario e introducir un folio
   QA/DEMO previamente existente en la empresa activa. Nunca inventar un folio.
2. Verificar que cliente, total, cobros y saldo corresponden al documento.
   Iniciar y recorrer los tres pasos. Abrir sólo los enlaces de consulta.
3. Comparar Devengado/Efectivo con los meses adecuados y el desglose documental
   cuando esté disponible. El total de la empresa no es el de una sola factura.
4. Volver, reiniciar, salir y cerrar con X/Escape. Reabrir sin selección previa;
   no debe aparecer ninguna operación, pago, REP o timbrado nuevo.
5. Probar folio inexistente, otro tenant, cliente operativo, CFDI live, nota de
   crédito vigente, cobros incompatibles y fallo de lectura. No iniciar ni
   mostrar enlaces con evidencia inválida.
6. Dispatcher, Cliente y demás roles no Admin: no ver el botón ni disparar las
   consultas del recorrido. Cambio de organización/usuario descarta evidencia.

Las pruebas automatizadas usan datos simulados aislados y la barrera de red de
Vitest. No acreditan por sí solas fixtures alojados ni una prueba de navegador
contra la versión publicada. El estado de esas comprobaciones debe comunicarse
por separado y sin completar datos faltantes mediante escrituras.

## Validación local (2026-10-21 UTC)

- 41 pruebas focales aprobadas en cuatro archivos: reglas de escenarios,
  consultas acotadas/paginadas, recorrido/cierres/foco/permisos y regresión del
  Dashboard financiero. Ejecutadas sin red con un worker.
- ESLint de todos los archivos cambiados: sin errores ni advertencias.
- TypeScript focal: los tres archivos productivos nuevos y sus tres pruebas,
  extendiendo `tsconfig.json` con los tipos ambientales de Node y el setup de
  pruebas; aprobado. No sustituye el typecheck global de integración.
- `git diff --check`: aprobado. Sin manifest/lock ni cambios SQL.
- No se ejecutó build ni suite global en este worktree. No se verificaron tres
  fixtures alojados actuales ni navegador de la versión publicada. Se mantienen
  como comprobaciones separadas; no se inventaron registros para cerrarlas.

Comando focal:

```sh
node node_modules/vitest/vitest.mjs run \
  src/features/invoices/lib/__tests__/demoTour.test.ts \
  src/features/invoices/hooks/demo/__tests__/useDemoEvidence.test.tsx \
  src/features/invoices/components/demo/__tests__/DemoTour.test.tsx \
  src/features/dashboard/pages/__tests__/Dashboard.financialAccess.test.tsx \
  --maxWorkers=1
```
