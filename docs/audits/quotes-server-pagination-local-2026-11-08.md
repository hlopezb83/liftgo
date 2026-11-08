# Auditoría y experimento local: Cotizaciones después de500

Actualización: la fase RPC local posterior se documenta en [quotes-natural-rpc-local-2026-11-08.md](./quotes-natural-rpc-local-2026-11-08.md). Este documento conserva el diagnóstico/diseño anterior y sus límites históricos.

Base remota verificada:026d1ce6d6eaa8350b27db0d23ce09c4c85951a5 (main, PR408). Rama local:fix/quotes-server-pagination-local. No push, PR, migración, datos reales ni despliegue.

## Reproducción

501 cotizaciones sintéticas:500 nuevas draft y una antigua accepted COT-0445. El hook legado obtiene501; la pantalla recorta500 y después filtra localmente. Buscar COT-0445/cliente antiguo o accepted da cero, aunque exista la antigua. Móvil y escritorio consumían el mismo dataset recortado. El aviso compartido aconseja refinar filtros, pero esa pantalla no consultaba el universo remoto al refinar.

## Experimento implementado, no aprobado para publicar

Nuevo useQuotesPage exclusivo de esta pantalla: tenant verificado en consulta/cache, sesión vigente, E2E excluido, filtro servidor antes de range, count exact, proyección mínima, páginas1..100 filas, orden estable y recuperación una vez de página fuera de rango. Los filtros/size/sort continúan en URL, búsqueda/estado reinician página. Móvil usa las mismas filas/paginación que escritorio. Los errores de sesión/HTTP que devuelve el servidor conservan error/reintento. No se afirma detectar denegaciones RLS silenciosas: una policy SELECT que filtre todas las filas puede devolver cero sin error.

Se retira sólo de Cotizaciones el aviso de truncamiento; no se modifica ListTruncationNotice ni contratos de useQuotes, useQuotesLite, CRM, detalle o useQuotesByIds. useQuotes sólo exporta su proyección. Parser de folio existente trasladado al dominio y reexportado por compatibilidad, sin cambiar búsqueda global.

Búsqueda de folio445/0445/COT-0445/cot-445/000445 añade igualdad canónica sin Number; mantiene coincidencias substring de cliente. Regex literal sólo amplía diacríticos españoles/latinos occidentales comunes en customer_name, incluyendo NFD; folio sin expansión. Escapa %,_,*,comillas,barra,comas,paréntesis y metacaracteres. Tamaño del filtro URL limitado a6000 bytes codificados para dejar margen de request. No promete equivalencia universal de ligaduras/Unicode con matchSorter. No expande el helper global.

## Diferencia pendiente de decisión

REST ordena texto por colación del backend: no preserva natural numeric:true para folios de ancho variable (COT-10000/COT-9999), ni todas las reglas localeCompare de cliente. El experimento lo rotula Folio(texto), pero NO constituye equivalencia ni aprobación de ese cambio UX. No hay columna numérica de orden de folio disponible ni garantía fecha↔folio. No se usa orden local por página como falsa solución. Ver propuesta separada `quotes-server-pagination-rpc-proposal-2026-11-08.md`.

## Validación y límites

- Suite afectada:311 pruebas en40 archivos pasaron (cotizaciones, búsqueda global y ListPageLayout). Incluye28 de HTTP/contrato y6 de pantalla nueva. Lint completo cero warnings, typecheck app/browser, arquitectura y journal129 migraciones pasaron. Build fake pasó; se repite al último snapshot.
- Pruebas HTTP con SDK Supabase real y endpoint de memoria: reproducción501, tenant A/B, E2E, conteo, rango, orden, folios, escapado, diacríticos, límitesURL, errores y recuperación416. Son pruebas del contrato de transporte, NO de RLS/regex ejecutado por PostgreSQL.
- Componentes reales de tabla/layout/router en ambos modos: navegación más allá500, totales remotos, búsqueda desde página posterior, filtros/limpieza/URL, error/reintento, loading y enlace móvil.
- Chromium1440/360/390: infraestructura fake arrancó pero navegador no arrancó (`socket() failed: Operation not permitted`, crashpad sin database). Los tres escenarios quedaron SIN EJECUTAR. No hay capturas ni certificación visual. Spec entregado para ejecutar en CI/entorno permitido; no se eludió sandbox.
- Build siempre contra backend ficticio con harness fail-closed. No se usó backend real. Runtimes locales Node24.22.1 (admitido por engines) y Bun1.4.4; lock/manifiesto sin cambios.
- Sin suite total Vitest, CI remota ni SQL/RLS real. La aprobación funcional final está pendiente del contrato de orden natural y de navegador/PostgreSQL.
