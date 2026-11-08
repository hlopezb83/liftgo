# CRM: referencias de cotización independientes del primer lote

## Alcance

Corrección local sobre `a58d556844e91ee77ad2b7b6c79cfe34b46c225a` de `hlopezb83/liftgo`. No modifica `useQuotes`, `useQuotesLite`, `useQuotesByIds`, sus proyecciones ni sus contratos públicos existentes. No agrega migraciones, permisos, RLS, escrituras fiscales ni despliegues.

El defecto anterior afectaba cotizaciones fuera de las 501 más recientes: desaparecían del selector y del mapa del CRM, y la validación de tipo de cambio se omitía al no encontrar la relación en ese lote. El ID almacenado no se borraba automáticamente.

## Cambio

- `useCrmQuote`: recupera la cotización vinculada por ID con una proyección pequeña. Su lectura no depende de búsqueda, página ni límite global.
- `useCrmQuoteNumbers`: recupera sólo los folios referenciados por prospectos, deduplicando IDs y consultando lotes de hasta 100.
- `useCrmQuoteOptions`: búsqueda remota por folio/cliente y páginas de 50, con orden determinista `created_at DESC, id DESC`. El formulario aplica debounce y conserva la opción vinculada aunque no esté entre los resultados.
- Las tres consultas requieren identidad y organización verificadas. Filtran por esa organización y excluyen E2E, usan el cliente autenticado normal, incluyen usuario/organización en la clave de caché y entregan el AbortSignal al transporte. Viven bajo `quotes/list` para recibir las invalidaciones existentes.
- El formulario bloquea el guardado con vínculo pendiente, en refetch, con error o no disponible. La validación monetaria usa únicamente el detalle del ID actual, nunca el primer lote ni datos de otro ID.
- Recuperar o refrescar un detalle no modifica empresa, monto, notas ni selección. La conversión automática ocurre únicamente al elegir explícitamente una opción. “Sin cotización” permite desvincular y guardar conservando el monto manual.
- Tarjeta y detalle conservan una etiqueta genérica de referencia cuando no se conoce el folio. La etiqueta expresa el vínculo almacenado, no confirma disponibilidad ni autorización para leer la cotización. La navegación sigue la ruta protegida habitual.
- El selector distingue carga, error, búsqueda sin resultados y más páginas; ofrece reintentos explícitos. El CRM informa fallos al cargar los folios.

## Validación

Dependencias instaladas con Bun **1.4.4**, `bun install --frozen-lockfile`. `bun.lock` no cambió: SHA-256 `3d434bb266707543383f5769cee4319a096783a8b24210b07df8ea308eab8bef`. Runtime Node **24.22.1**, Vitest **5.0.5**.

- CRM completo, quotes completo e `identityScopedCache`: **51 archivos, 322 pruebas aprobadas**.
- Incluye 1,103 referencias, búsqueda de cotización antigua, paginación, detalle independiente, aislamiento de claves user/org, cambio de ID, respuestas tardías/canceladas, falta de identidad, formulario cerrado, error con dato cacheado, preservación histórica y desvinculación explícita.
- Pruebas HTTP con PostgREST real y transporte simulado verifican proyección, límites, filtros de organización/E2E y escape de sintaxis/comodines. No son una prueba de RLS de la base viva.
- Typecheck completo, lint focal y lint completo sin warnings, y guardrails de arquitectura aprobados. En el checkout de validación, el lint completo excluyó únicamente `audit-validation/**`, que contiene cachés y herramientas locales no versionadas; no se excluyó código del repositorio.
- Build real cliente/SSR aprobado mediante `node scripts/browser-test-server.mjs --build-only`, con backend y telemetría sintéticos. Los archivos locales de entorno se apartaron sin leer durante el build y se restauraron después. El build emitió warnings de dependencias (`use client`, tamaño de chunks y `fontkit.open`); no se alteraron esas dependencias.
- Fuente compilada: `b3f7966f12a97ddfbb3551ab2e7e2d0427e6f4c7950b8edf8a96e31f57ac9aa2`. Los manifiestos generados no forman parte del commit.

Comandos reproducibles:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run arch:check
bun run lint --max-warnings=0
bun run test src/features/crm src/features/quotes src/lib/query/__tests__/identityScopedCache.test.tsx --maxWorkers=3
node scripts/browser-test-server.mjs --build-only
```

## Límites explícitos

- La paginación del selector es por offset, no un snapshot transaccional. Altas/bajas concurrentes pueden desplazar opciones entre páginas; la selección y su validación siguen resolviéndose por ID y no se pierden por ese desplazamiento. Los IDs ya recibidos se deduplican en el formulario.
- La validación de TC es del formulario. No reemplaza validaciones de servidor ni ofrece una garantía transaccional frente a cambios posteriores al último fetch.
- No se ejecutaron lecturas/escrituras reales, SQL vivo, pruebas A/B entre empresas reales, migraciones, push ni despliegue.
- Las pruebas DOM de CRM pasaron. Se intentó además el smoke de arranque Chromium con servidor/proxy loopback aislados en 4873/4874. El servidor arrancó, pero Chromium abortó antes de navegar por `socket() failed: Operation not permitted`. Los dos casos de smoke quedaron bloqueados por el entorno; no se cambiaron controles de seguridad ni se eludió la restricción. No se declara E2E de navegador aprobado.
- Se ejecutó la suite enfocada ampliada, no toda la suite de la aplicación.
