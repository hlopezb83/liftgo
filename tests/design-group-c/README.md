# Grupo C: fixtures locales de diseño

Estos fixtures verifican componentes y el build real de LiftGO con datos ficticios. No abren un despliegue remoto ni usan una sesión operativa. No prueban guardado real, RLS o backend.

La aceptación principal utiliza `group-c.spec.ts` y `accounts-payable.spec.ts` contra el build real, sus hooks y su router. El carril `component/` es una comparación suplementaria con mocks de hooks, permisos y navegación; **no es E2E**.

La base de comparación es `9f3e07c289eb5508251b6c43d282a267ee46ff6d`. Los archivos de `before/` conservan el comportamiento anterior de pago y tarjetas de cliente; sólo se adaptaron sus imports para ubicarlos fuera de `src`. No se incluyen en el build de la aplicación.

`node tests/design-group-c/regenerate-before.mjs` regenera exclusivamente esos cuatro blobs UI mediante buffers UTF-8 y guarda sus hashes en `before/provenance.json`. Así se evita que el code page de la consola Windows altere textos del snapshot.

## Comprobaciones

- Pago MXN/USD: antes el saldo USD y el campo MXN no coinciden; después ambos usan la moneda de la factura. El valor numérico permanece igual.
- Historial de cliente: nombres, folios e importes largos; reserva y factura se comparan antes/después.
- Aplicación real: captura y detalle de clientes, alta/edición y detalle de equipos, Sheet de proveedor, diálogo de pago y captura de proveedor.
- Roles ficticios: costos de equipos y resumen financiero se verifican con accesos independientes. Los permisos de la aplicación no se modifican.
- Escape/Cancelar/Volver y retorno exacto, confirmación de borrador, foco al cerrar pago y Sheet, acciones persistentes, errores y último campo. Los controles con foco se comprueban contra header/footer antes de introducir scroll artificial; los anchos aceptados se asertan, además de registrarse.

Los viewports son 360×800, 390×800 y 1440×1000. La reducción a altura 420 simula un viewport pequeño mientras un campo tiene foco. **No certifica teclado virtual real, iOS/Safari, safe-area o dispositivos físicos.**

Tras redimensionar un diálogo se espera a que finalice su animación y se estabilice el layout antes de medir. No se introduce scroll artificial para hacer pasar el foco. La activación del listado usa tap cuando `hasTouch` está activo y click en desktop; el pull-to-refresh móvil normaliza eventos táctiles.

## Aislamiento

La copia de build debe exportarse sin `.env`, `.env.*` o `.dev.vars`; no se abre su contenido. Los valores de backend/Sentry son ficticios y apuntan a loopback. El servidor de prueba utiliza exclusivamente el build indicado y no reutiliza servidores existentes.

El transporte admite server functions de lectura identificadas en el propio build, tablas GET y RPC de lectura enumerados en `fixtures.ts`. Cualquier endpoint o método desconocido falla la prueba. Las escrituras, red externa y WebSockets se bloquean. Las peticiones externas esperadas de tipografía o telemetría se registran como bloqueadas; no se afirma fidelidad de fuentes remotas.

El carril suplementario sólo admite assets GET locales enumerados de Vite; usa `maxRedirects: 0`, rechaza respuestas de redirección y bloquea archivos de entorno, escrituras y toda red externa.

Los controles de envío sólo se pulsan con formularios inválidos para comprobar validaciones. Los tests unitarios de pago utilizan hooks sintéticos para comprobar errores y limpieza de comprobantes; no suben archivos a Storage.

La integracion usa por defecto el build dist/ de este checkout aislado (GROUP_C_BUILD_DIR=.) y guarda evidencia en test-results/group-c. Ambos destinos admiten overrides locales. Mantener el prebuild con backend ficticio; sus metadatos generados locales se respaldan/restauran segun el protocolo y no se incluyen en commits UI.

## Ejecución

Usar dependencias ya preparadas y un solo worker. Configurar `SMOKE_CHROMIUM_PATH` si se necesita un Chrome instalado; sin esa variable Playwright utiliza su navegador administrado. `GROUP_C_BUILD_DIR` selecciona la copia de build y `GROUP_C_EVIDENCE_DIR` el destino local de evidencia.

Primero compilar el checkout aislado con valores ficticios explicitos y prebuild habilitado. La generacion local actualiza public/version.json y public/changelog-recent.json: respaldarlos y restaurarlos segun el protocolo, sin bump ni incluirlos en commits UI. Despues ejecutar:

```text
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.group-c-design.json
node node_modules/eslint/bin/eslint.js --config eslint.group-c-design.config.mjs tests/design-group-c playwright.group-c-component.config.ts playwright.group-c-design.config.ts vite.group-c-fixture.config.ts
node node_modules/@playwright/test/cli.js test --config playwright.group-c-component.config.ts
node node_modules/@playwright/test/cli.js test --config playwright.group-c-design.config.ts
```

Si el sandbox de Windows impide renombrar la caché temporal, fijar `TEMP` y `TMP` a un directorio dentro del workspace. No modificar configuraciones compartidas para resolverlo.

Las configuraciones estan integradas en el job quality de CI y en tsconfig.browser-tests.json, incluidos los fixtures .tsx y el config Vite. La aceptacion real y las comparaciones suplementarias conservan sus proyectos y escenarios existentes. CI esta configurada para ejecutarlas; este documento no acredita una corrida remota.
