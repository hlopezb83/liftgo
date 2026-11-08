# Cotizaciones: entrada táctil de la prueba de paginación

## Evidencia y causa

PR #410, run Quality `42496239410`, job `128779093843`, artifact `13623482671`. El árbol publicado `39430e7ea7bac92d3d925ff0f9332d58e3b02874` coincide con el candidato local `9195dbcf24b84e31c77080fdaa93f4fb44b03ea8`.

El spec nuevo pasó en escritorio y falló a 360/390 px después de activar «Anterior» con `locator.click()`. La traza móvil confirma el botón habilitado, coordenadas correctas y click terminado, pero URL todavía `tablePage=20` y una sola llamada RPC, la inicial con `p_page=20`. El rango seguía mostrando `501–501 de 501`. No se trataba de un texto distinto ni de una respuesta de paginación incorrecta.

El pull-to-refresh compartido existente configura `useDrag` con `pointer.touch=true` y `filterTaps=true`. En un dispositivo con touch, @use-gesture/core 10.3.1 escucha touch y su `pointerClick` cancela clicks de detalle positivo antes de un tap reconocido. Playwright `locator.click()` genera ratón incluso con `isMobile`/`hasTouch`; `locator.tap()` genera la secuencia táctil. El repositorio ya utiliza el mismo patrón en `tests/design-group-c/group-c.spec.ts`.

Se reprodujo con el hook y motor reales en jsdom, sin mock de gestos: mousedown/up/click no activó el botón; touchstart/end y click posterior sí lo activaron, sin refrescar. Una segunda reproducción independiente del Controller real en happy-dom confirmó ambos resultados.

## Corrección acotada

- El spec elige `tap()` cuando el proyecto declara `hasTouch`, y `click()` en escritorio, para paginación y controles de filtros.
- Conserva todas las comprobaciones de rango, búsqueda, estado, enlaces accesibles, overflow y bloqueo de red/escrituras.
- Añade comprobación de RPC `p_page=19` con tenant, tamaño y filtros esperados, URL de página 19, ausencia del folio antiguo y «Siguiente» habilitado.
- Añade regresiones positivas del hook real para activación táctil y teclado sin refresh. No fija como contrato deseable el bloqueo del ratón.
- No cambia código de aplicación, RPC, SQL, ACL, filtros, router ni hook global.

## Validación local

Pasaron 43 pruebas en cuatro archivos: gesto existente, nuevas interacciones touch/teclado, transporte RPC y pantalla Cotizaciones móvil/escritorio. También se verificaron TypeScript app/browser, arch-check y diff-check. Lint del test DOM: sin warnings. El spec no está incluido en el lint general; al aplicar explícitamente las reglas Playwright existentes del grupo C tuvo cero errores y las dos advertencias preexistentes por assertions condicionales móvil/escritorio. Estas pruebas no ejecutan Chromium ni certifican el nuevo spec en CI.

## Límites

El bloqueo de un ratón físico en un dispositivo híbrido/táctil antes del primer tap es un comportamiento preexistente del hook compartido y queda fuera de este parche. Corregir la entrada del spec no demuestra que ese caso de uso esté resuelto.

No se relanzó Chromium local tras el bloqueo previo de sockets del entorno. El cambio debe validarse con el rerun de Quality/Playwright en CI sobre su nuevo SHA; las pruebas DOM y la traza explican el fallo, pero no sustituyen esa ejecución. No se subió este parche ni se ejecutó una migración o despliegue.
