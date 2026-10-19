# PR283: reconciliación con main tras PR282 y PR285

Punto de partida de PR283: `991347f1e871791c5f9243cbaf89e81f14e12b3f`.
Base común: `7ac56b7b904f79fdb0b194dbccd97d67f364273a`.

Se integró primero el main exacto `4de7d314c140ccccb326730430bd8e6eb96219c8` (PR282) mediante `merge --no-commit --no-ff`; el merge local quedó en `e2b44a9f2`. Mientras se verificaba, el padre informó el nuevo main `3d679f30da4ffdf861a2ac185c435128fe3d1809` (PR285). Ese segundo main se integró después del primer commit. Ambos merges fueron automáticos, sin archivos en conflicto ni resoluciones manuales de código.

`main282-preservation.json` conserva el checkpoint de los 43 archivos aportados por los dos primeros padres. `preservation.json` verifica el resultado final: 59 rutas únicas, con 71 comparaciones padre/archivo, todas con el mismo blob Git que su padre de origen. Incluye fuentes, pruebas y evidencias históricas, incluidos los archivos vacíos de lint/tipos en sus ubicaciones originales. La migración 0105, su snapshot y el journal coinciden exactamente con main PR285.

## Pruebas comparables

La selección histórica descrita como 144 casos no tenía una lista explícita conservada. El padre autorizó recuperar las suites del JSON de fechas y el manifiesto SAT, añadir compatibilidad, moneda/FX y fechas, y registrar el conteo real. Se ejecutaron **los mismos 127 casos en 20 archivos antes y después**. Las comparaciones de casos usan claves ordenadas `archivo + título`; el orden de ejecución dentro de los reportes puede variar.

| Corpus ejecutado | Antes del primer merge | Después de ambos merges |
| --- | --- | --- |
| SAT, fechas de pago, captura de fecha de factura, FX, permisos y controles relacionados | 127/127 PASS, 20 archivos | 127/127 PASS, mismos 20 archivos y casos |
| Moneda/TC de extensión y controles del formulario/reserva | Checkpoint tras PR282: 74/74 PASS | 74/74 PASS, 8 archivos |
| Recuperación REP y controles de permisos/caché/handler | La evidencia histórica de PR285 permanece en su carpeta | 58/58 PASS, 4 archivos, comando del corpus original |

Los tres corpus finales suman 259 ejecuciones; algunos controles se comparten. Los JSON registran rutas relativas, hashes LF de los tests, títulos y estados; omiten mensajes de fallo, stdout/stderr y rutas privadas. `summary.json` registra la comparación, checks y límites. Los resultados intermedios de PR282 permanecen separados en `main282-*.json`.

Validación final adicional: TypeScript de aplicación y pruebas de navegador, ESLint de todos los fuentes/tests afectados de ambas ramas, journal de 106 migraciones y `git diff --check`: código 0. Build cliente/SSR con Vite: código 0. Se ejecutó Vite directamente para evitar regenerar versiones/changelog; Sentry upload y métricas se deshabilitaron y las variables API del build apuntaron a loopback. El build emitió advertencias de dependencias (`use client`, fontkit, externalización de node:events), plugin de paths y tamaño de chunks; no se ampliaron cambios para resolverlas.

## Repetición

Con TEMP/TMP/TMPDIR apuntando al `.tool-tmp` del checkout, usar Vitest 4 con `--maxWorkers 1`. La lista explícita de cada corpus y sus casos está en `before-payments.json`, `after-payments.json`, `after-extensions.json` y `after-rep.json`. La selección de extensiones incluye `useExtensionPrefill.currency.test.tsx`, el directorio `invoiceForm/__tests__`, `useBookingExtensions.test.ts` y `extensionBilling.test.ts`; REP utiliza los cuatro archivos documentados en la evidencia original de PR285.

El comando inicial de Git se detuvo antes de aplicar el merge por identidad de committer ausente. Se usaron `-c user.name=Codex -c user.email=codex@openai.com` por comando para los merges y commits; no se cambió configuración global ni se eludió un rechazo de permisos. No se registraron rechazos de permisos o de aprobación automática.

La evidencia corresponde a pruebas unitarias offline y compilación local. No se ejecutaron navegador, backend publicado, Auth/SQL remotos, migraciones ni PAC. El padre mantiene la integración de la rama remota y las decisiones de revisión/publicación.
