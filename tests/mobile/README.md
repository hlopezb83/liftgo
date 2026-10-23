# Aceptación móvil del build real

`playwright.mobile.config.ts` ejecuta 20 escenarios: diez a 360×800 y diez a
390×800, con Chromium en emulación responsive/touch y taps simulados en
menú, navegación rápida y filtros. El job `quality` de
`.github/workflows/ci.yml` los ejecuta después del smoke, reutilizando su build
ficticio validado y Chromium instalado por la acción existente.

## Cobertura

- Acceso de empleados: mostrar/ocultar contraseña. Portal: contraseña editable
  y enmascarada, sin exigir el toggle que esa pantalla no ofrece. Ambos validan
  campos y botones dentro del ancho del viewport, recuperación sin enviar correo, volver
  al acceso y segunda hidratación tras recargar.
- Listas con tarjetas ficticias no vacías de reservas, entregas y devoluciones;
  enlaces enfocables y ausencia de desbordamiento horizontal en documento y
  contenedor principal.
- Portal de clientes: dos facturas y dos cotizaciones ficticias, tarjetas con
  enlaces nativos, Tab/Shift+Tab/Enter (sin `locator.focus()`), indicador de foco
  calculado, detalle del registro correcto, Atrás/Adelante, tap, recarga, monedas
  MXN/USD y ausencia de desbordamiento horizontal. Captura de la lista enfocada
  para inspección visual; no sustituye una comparación visual aprobada.
- Menú móvil: cerrar/reabrir, exclusión de módulos financieros, navegación,
  Atrás/Adelante sin dejar el menú abierto.
- Navegación rápida: filtro por permisos, teclado, cierre/restauración de foco,
  reapertura y selección de destino; resize adicional a 480px de alto.
- Filtros: ancho/alto dentro del viewport, foco contenido, Escape, reapertura,
  botón Cerrar y restauración de foco.

## Aislamiento

Se ejecutan los assets reales, sin imports ni bypass de autenticación dentro de
la app. El navegador recibe una sesión sintética y respuestas ficticias para
exactamente dos funciones de lectura cuyos IDs se extraen del build actual.
Cada perfil (dispatcher o portal) tiene una lista de GET REST explícita; los
RPC permitidos son sólo lecturas conocidas. Las demás funciones, endpoints y
mutaciones abortan y hacen fallar la prueba. Los redirects locales no se siguen y hacen fallar la prueba. Toda
otra red HTTP y todos los websockets se bloquean. Service workers están
deshabilitados. No hay claves, usuarios, empresas ni datos reales.

El guard heredado del smoke rechaza destinos remotos, servidores preexistentes,
artefactos con referencias productivas y builds sin el marcador ficticio.
`src/test/mobileOfflineDispatcher.test.ts` prueba el interceptor sin navegador,
incluidos POST/PATCH/DELETE, lecturas desconocidas y funciones no permitidas.
Los errores JavaScript no controlados y las peticiones inesperadas se verifican
al terminar cada escenario, también si la aserción de UI falla.

## Ejecución

Con Node >=24 y Bun según `.github/actions/setup-bun-project/action.yml`:

    bun install --frozen-lockfile
    bunx playwright install --with-deps chromium
    bun run typecheck:browser-tests
    bun run test:e2e:mobile

Sólo las cuatro pruebas nuevas del portal, con un Chromium ya instalado:

    SMOKE_CHROMIUM_PATH=/ruta/a/chromium bun run test:e2e:mobile portal-card-navigation.spec.ts

El último comando compila explícitamente con backend ficticio y sirve el build
real con Wrangler local en 4173. No proporcionar credenciales ni apuntar a un
servidor vivo. En CI, `SMOKE_REUSE_BUILD=1` reutiliza el build ya generado con los
mismos valores ficticios que exige `playwright.smoke.config.ts`.

El artifact `mobile-acceptance-artifacts` conserva el HTML, screenshots en los
puntos de control y traces/screenshots de fallos durante siete días. Para dar la
aceptación por aprobada, verificar el resultado de los 20 escenarios del commit
exacto; discovery, typecheck y build por sí solos no son una ejecución de UI.

Clasificar fallos antes de corregir: contrato de fixture (llamada inesperada o
cambio del manifest), comportamiento del producto o arranque del runner. No
convertir endpoints desconocidos en respuestas vacías ni desactivar guards para
hacer pasar la prueba. Si el entorno restringe sockets o DevTools, no modificar
la política ni cambiar puertos para evitarla: usar el runner CI autorizado.

## Límites

Las respuestas sintéticas validan UI, no autorización de servidor, RLS,
integración Supabase ni emisión fiscal. La emulación no certifica dispositivo
físico, Safari/iOS, teclado virtual real, safe areas ni gestos táctiles reales.
Reducir la altura sólo prueba resize: no demuestra que se haya abierto el
teclado del dispositivo. Esa aceptación debe registrarse por separado.
