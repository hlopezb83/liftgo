# Revisión local de Nueva factura

Este carril sirve el build real de la aplicación con la configuración ficticia
heredada de `playwright.smoke.config.ts`. No requiere credenciales ni reutiliza
sesiones: `tests/mobile/offlineDispatcher.ts` crea una sesión sintética de un
administrador ficticio con acceso a Facturas y responde sólo lecturas enumeradas.
Todos los usuarios, clientes, empresas e importes son fixtures locales.

El interceptor bloquea escrituras REST, funciones fiscales, RPC no enumerados,
autenticación real, conexiones externas y websockets. Las funciones de servidor
permitidas son las dos lecturas ya usadas por el carril móvil; los IDs se extraen
del artefacto compilado actual. El RPC adicional `peek_next_draft_invoice_number`
es sólo lectura. Nunca se pulsa un submit válido ni se persiste una factura.

## Ejecución

    bun run test src/test/mobileOfflineDispatcher.test.ts
    bun run typecheck:browser-tests
    bunx playwright test --config playwright.invoice-ui.config.ts

Para reutilizar un build ya generado con el backend ficticio, configurar
`SMOKE_REUSE_BUILD=1`; el guard heredado comprueba el marcador ficticio y rechaza
referencias productivas antes de servirlo. `SMOKE_CHROMIUM_PATH` permite usar un
Chromium local instalado. El origen de la aplicación debe seguir siendo local.

El job `quality` de `ci.yml` ejecuta los 24 escenarios después de la aceptación
móvil, con `SMOKE_REUSE_BUILD=1`, dentro del carril CI existente sin ampliar
sus filtros de ramas.

El fix de disponibilidad de factura ya se integró en `main` mediante
[#351](https://github.com/hlopezb83/liftgo/pull/351). La UI conserva el ancestro
`88a718141346430d32f283db2c750e53bcb092da` y no reimplementa el fix.

`INVOICE_CAPTURE_PHASE=before` etiqueta las capturas como previas y omite la
aceptación; no restaura código anterior. El baseline real se capturó antes de
editar la UI, sobre `88a718141346430d32f283db2c750e53bcb092da`. Reproducirlo requiere
la UI de ese commit más este fixture. `after` (predeterminado) añade la aceptación
de las mejoras. En local, las capturas se guardan en `test-results/invoice-ui/`.
CI genera sus propias capturas sintéticas; el artifact de diagnóstico existente
puede incluirlas si falla `quality`. No consume la carpeta de evidencia local.
Se capturan viewports de encabezado/conceptos/resumen y cada tarjeta de partida,
porque la aplicación usa un contenedor principal con scroll interno.

## Cobertura y límites

Los 24 escenarios (ocho por viewport) en escritorio de 1440px y móviles de
360/390px comprueban tarjetas y controles sin
desbordamiento horizontal, resumen lateral, acciones sticky, importes, IVA,
moneda, eliminación, SAT con código y nombre, Tab/Shift+Tab/Enter/Escape,
validación inválida, Cancelar/Volver con cambios sin guardar, interrupción del
cierre nativo y resize manteniendo identidad DOM, valores y foco. El cierre usa
`page.close({ runBeforeUnload: true })` y cancela el diálogo real del navegador;
no se afirma haber verificado la recarga.

Los escenarios verifican errores JavaScript y peticiones backend inesperadas
también al fallar una aserción. No sustituyen E2E autenticado contra un backend
aislado ni validan guardado, timbrado, permisos reales o integración fiscal.
