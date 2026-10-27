# Validación final del grupo C

Aplicación: `59424064ec8feb513c17128b4e80583c82b1466c`, sobre `9f3e07c289eb5508251b6c43d282a267ee46ff6d`.

Versión conservada: **8.45.1**. En el checkout UI no se editaron package, versión, changelog, CI, backend, SQL, Edge Functions ni permisos.

Fuente exportada, fuente del build aislado, manifiestos y marcadores de bundles coinciden en:

```text
7b49bbad5e367148962fb6b2be936e7d77d62c712ecac76f4ea8c3b8145a0cc7
```

El ZIP de entrada tiene SHA256 `1049178d5c67a053c5d9cab7082efd8b1d8bf1c32ebda63567419e04b4739a4f`. Vite regeneró sólo los finales de línea de `routeTree.gen.ts`; se comprobó igualdad de contenido normalizado y se restauraron sus bytes del ZIP únicamente en la copia de build. No se modificó ese archivo en el checkout UI.

## Resultados terminales

| Comprobación | Resultado | Evidencia local |
| --- | --- | --- |
| Build aislado con backend ficticio | exit 0 | `build.log`, `build-metadata.log` |
| Aplicación compilada, router y hooks reales, transporte ficticio | **54/54**, exit 0, un worker | `app-final.log` |
| Comparación suplementaria con mocks | **18/18**, exit 0, un worker | `component-final.log` |
| Unitarias focalizadas durante implementación | **189** aprobadas: CxP 92, clientes 44, equipos 53 | logs de pago/CxP y `STATUS_PRE_VISUAL.txt` |
| Regresión final de formularios en este commit | **15/15**: cliente 5, proveedor 4, equipo 6 | `final-form-regressions.log` |
| Guardas sintéticas de artefactos | **1/1**, exit 0 | log del guard del harness |
| Typecheck completo y del harness | exit 0 | `final-checks-status.json` |
| Lint completo, focalizado final y del harness | exit 0 | `lint-product-final.log`, `final-checks-status.json` |

Los 15 tests finales repiten parte de los 189 focalizados; no se suman como tests únicos adicionales. El carril de componentes **no es E2E**. La aceptación principal recorre la aplicación compilada con datos ficticios y no certifica backend/RLS ni escrituras reales.

Comandos del cierre:

```text
# Dentro de la copia aislada, sin archivos de entorno y con valores ficticios explícitos:
node scripts/gen-version.mjs
node node_modules/vite/bin/vite.js build

# Desde el checkout UI, SMOKE_CHROMIUM_PATH configurado para Chrome local:
node node_modules/@playwright/test/cli.js test --config playwright.group-c-design.config.ts
node node_modules/@playwright/test/cli.js test --config playwright.group-c-component.config.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.group-c-design.json
node node_modules/eslint/bin/eslint.js .
node node_modules/eslint/bin/eslint.js --config eslint.group-c-design.config.mjs playwright.group-c-design.config.ts playwright.group-c-component.config.ts vite.group-c-fixture.config.ts tests/design-group-c
```

La ejecución local de build se conserva además en `group-c-evidence/run-isolated-build.ps1`; borra variables de subida, usa sólo backend/Sentry ficticios y no modifica los metadatos del checkout UI. El harness desactiva carga de `.env`, rechaza redirects, escrituras y endpoints desconocidos. Sólo se añadieron lecturas concretas respaldadas por los hooks al completar fixtures; no existe un fallback vacío para solicitudes desconocidas.

## Reproducción y píxeles

La prueba unitaria de moneda pasa en MXN y falla en USD antes del fix porque el saldo es USD y el campo Monto muestra MXN. Después ambos pasan con el mismo valor numérico. Los snapshots se generan desde buffers Git UTF-8; `before/provenance.json` guarda fuente y hashes.

Las capturas locales incluyen, para 360/390/1440:

- `*-payment-before-USD.png` y `*-payment-after-USD.png`: comparación suplementaria sin conversión.
- `*-supplier-real-MXN.png`, `*-supplier-real-USD.png` y `*-supplier-real-*-error-focus.json`: moneda, importe y validación en la aplicación.
- `*-supplier-sheet-top.png`, `*-supplier-sheet-history.png`: contexto y acción permanente del Sheet.
- `*-supplier-new-height-420-focus.png`: Retención ISR completo sobre el pie unificado, con aviso de aprobación e importes intactos.
- `*-customer-detail-invoices.png`, `*-customer-detail-bookings.png`, `*-customer-new-fiscal-selected.png`: jerarquía móvil y captura fiscal.
- `*-customer-fiscal-selected-focus.json`: Uso CFDI enfocado sin cobertura del footer.
- `*-fleet-edit-rates.png`, `*-fleet-edit-height-420-focus.png`: tarifas, notas y acciones completas.

Se revisaron los píxeles de los tres dominios en los tres anchos. Se asertaron overflow, foco, campos contra header/footer, Escape/Cancelar/Volver, retorno exacto de cliente/factura, lectura/ausencia de Facturas, aprobación de CxP y separación de costos/resumen financiero de equipos. El click de ratón emulado no navegaba en el listado móvil; se usó tap, coherente con su carril táctil de pull-to-refresh, y la aceptación pasó sin cambios de producto en ese listado.

La medición a altura 420 espera que termine la animación del diálogo antes de enfocar y medir; no usa scroll artificial para aprobar el foco. Un intento previo de build fue detenido por la guarda de identidad al solaparse la actualización de la copia con el arranque. Se conservó el fallo y se repitió desde fuente estable. Los logs de intentos anteriores no representan el resultado final.

## Límites y cierre

- La altura 420 es una simulación de viewport; no es teclado virtual físico ni certificación de iOS/Safari/safe-area.
- Red externa, WebSockets y mutaciones quedaron bloqueados. No hubo login productivo, datos reales, guardado real, subida a Storage, PDF o comprobación de RLS.
- Las fuentes remotas bloqueadas pueden producir fallback tipográfico.
- El selector fiscal cerrado conserva la elipsis heredada para etiquetas largas en móvil; su valor completo sigue disponible al abrirlo. No se modificó `SelectField` compartido.
- Un fixture unitario de equipos con decimales encontró validación HTML heredada de inputs numéricos sin `step`; no se alteraron sus reglas ni se presenta el guardado decimal como validado.
- Las configuraciones dedicadas no se incorporan automáticamente a CI o `tsconfig.browser-tests.json`; su wiring corresponde a la integración coordinada.

A las **2026-10-27 14:33:23 UTC** no había listeners en **4194/4195/9229** ni Workerd/Bun persistentes de este workspace (`process-cleanup.json`). Playwright terminó sus dos carriles. Las capturas permanecen locales; no se subieron a Library. No se hizo push, PR, merge ni deploy.
