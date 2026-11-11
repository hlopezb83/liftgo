# Panel por rol: aceptación aislada

Desde la raíz del repositorio:

```sh
node node_modules/@playwright/test/cli.js test --config tests/mobile/dashboard.playwright.config.ts
```

La configuración compila y sirve la aplicación real con el backend ficticio del
smoke. Se puede indicar un Chromium instalado mediante `SMOKE_CHROMIUM_PATH`.
`SMOKE_REUSE_BUILD=1` sólo reutiliza un artefacto que supere el guard de bindings
ficticios. No se reutiliza un servidor existente.

La matriz contiene seis escenarios: despacho y administración, cada uno a
320×800, 390×844 y 1440×1000. Comprueba:

- Pendientes primero en el DOM, transporte primero para despacho y cobranza
  primero para administración; finanzas antes de operación sólo para admin.
- Una sola aparición de cada alerta y documento esperado.
- Ausencia de indicadores, facturas y previsión de cobranza para despacho,
  incluso cuando el payload general incluye datos financieros sintéticos.
  Ese perfil tampoco debe invocar las lecturas de KPIs financieros ni cobranza.
- Nombres largos, importes grandes y KPIs completos sin desbordamiento
  horizontal; enlace y flecha visibles, y orden Tab/Shift+Tab entre KPIs.
- Cero peticiones de backend no previstas y cero errores JavaScript no capturados.

`dashboardOffline.ts` amplía `offlineDispatcher.ts` mediante un interceptor
separado con lecturas explícitas. Conserva el proxy local, el bloqueo de salidas
del Worker, los redirects denegados, los websockets cerrados y los service
workers deshabilitados. No contiene credenciales ni datos reales. Los perfiles
y permisos son respuestas de prueba; la suite no acredita RLS ni integración
con Supabase.

Las capturas quedan en `test-results/dashboard`: una vista superior del Panel
y otra de los KPIs por escenario. El contenedor principal tiene scroll propio;
una captura `fullPage` por sí sola no demuestra el contenido inferior.

No se concede acceso artificial al mecánico: la semilla versionada
`supabase/migrations/20260313001007_00257f0e-3169-4622-b893-8030305fe572.sql`
define `mechanic / Dashboard / none`. La prioridad de mantenimiento se cubre en
pruebas unitarias de orden, pero esta suite no afirma validar un Panel accesible
para ese perfil ni los permisos personalizados de una empresa conectada.

Esta emulación no certifica un dispositivo físico ni una sesión de ELOGISTIX.
La revisión operativa publicada con DEMO-LG01 es una validación independiente.
