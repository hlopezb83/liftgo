# Pendientes de auditoría: Vite, QR02 y QR07

Base: `e7af84852b2cb8c7bd5b394dea2a189e2f10cc81` (8.44.16).
Candidato: 8.44.17. Las ocho mejoras futuras quedan fuera de este lote.
No hay cambios de migraciones, funciones Edge, permisos ni datos de negocio.

## Correcciones

- **Vite:** 8.3.2 pasa a 8.3.3; un override aplica el mismo parche al Vite usado
  por Vitest. Se mantienen Vitest 4.1.11 y Rolldown 1.2.11. El lock elimina el
  subárbol redundante `vitest/vite` sin actualizar otras familias.
- **QR02:** las consultas paginadas de facturas y pagos de proveedor reciben
  `QueryFunctionContext.signal`. El transporte consume la señal y cada bucle
  comprueba el aborto antes de pedir otra página. Cancelar una consulta o
  desmontar su último observador impide páginas posteriores y resultados tardíos.
  Los demás fetchers mantienen su comportamiento; sólo cambia el tipo del helper.
- **QR07:** el XLSX de conciliación conserva cada importe original y añade
  moneda, tipo de cambio, equivalente MXN y motivo de inclusión/exclusión.
  El total timbrado se ubica en la columna MXN, separado de los importes
  originales que pueden mezclar monedas. Un tipo de cambio ausente o inválido
  no se sustituye por una equivalencia 1:1.
- **Variante QR07:** el total excluye también facturas canceladas internamente,
  igual que el KPI de la página. La fila y sus importes permanecen en el archivo.
  Ambos consumidores usan exactamente las mismas filas y filtros de
  `useReconciliationData`; no se altera el estado fiscal ni se elimina información.

## Regresiones

Las pruebas de cancelación usan QueryClient, cancelQueries y observadores reales
con transporte simulado que puede devolver respuestas tardías incluso después
del aborto. Incluyen control no cancelado y recuperación mediante refetch.
Las pruebas del XLSX construyen un workbook real y sustituyen sólo la descarga;
verifican moneda, FX, exclusiones y paridad con el resumen del hook.

Los gates existentes cubren lint, tipos, arquitectura, cobertura integral,
build, arranque y aceptación móvil. El build de pruebas usa el backend ficticio
loopback y no realiza operaciones sobre el servicio publicado. El estado final
debe consultarse para el SHA exacto del PR; una corrida pendiente no cuenta
como aprobada.

## Seguridad de dependencias: alcance y límite

La comparación `bun audit --json` del 20 de octubre elimina las seis entradas
Vite del baseline (tres avisos, cada uno aplicable a las ramas 8.2 y 8.3):
[GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv),
[GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) y
[GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
El resultado no es una auditoría global limpia. Continúan nueve familias
preexistentes y sin cambios de versión: brace-expansion, esbuild, launch-editor,
postcss-selector-parser, seroval, sharp, shell-quote, smol-toml y source-map-js.
Seroval y shell-quote incluyen avisos críticos en herramientas transitivas;
no se presume ausencia de riesgo por ser dependencias de desarrollo. Su
remediación requiere revisar esos caminos, no atribuirlos a este parche Vite.

## Fuera de esta validación

La prueba autenticada de descuento fijo de COT-0020 es una aceptación separada;
las pruebas automatizadas de este lote no la sustituyen. Tampoco constituyen
publicación, aceptación fiscal, migración remota ni autorización de fusión.
El PR 309, exclusivamente documental, se cerró sin merge; no se borró su rama.
