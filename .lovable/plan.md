# Auditoría Sentry LiftGO (sólo lectura) — 2026-10-09 a 2026-10-23 18:00 UTC

No se modificó nada: ni código, ni issues, ni configuración. Este documento es el informe; no hay nada que implementar si lo apruebas.

## Alcance consultado
- Organización: `elogistix`. Proyectos: `liftgo` y `javascript-react`.
- `javascript-react` tiene issues de otra aplicación (prefijo JAVASCRIPT-REACT-*). No se detallan aquí.
- Los issues LIFTGO-* aparecen en Sentry asociados internamente al proyecto `javascript-react`, aunque llevan el prefijo LIFTGO y la etiqueta `app=liftgo-erp`. Para separarlos se usaron la release `liftgo@*` y la etiqueta `app`.
- Los eventos guardan sólo la ruta, sin dominio (la limpieza de privacidad lo quita). Por eso **no se puede separar** liftgo.lovable.app de la vista previa: `url.domain:*liftgo*` devolvió 0 resultados.

## Operaciones y filtros usados
- `find_organizations`, `find_projects`.
- `search_issues` org completa: `is:unresolved lastSeen:-14d`, period 14d, limit 100. Una página, 20 issues, sin cursor siguiente.
- `search_issues` proyecto `liftgo`: el mismo filtro. Una página, 11 issues: resultado completo.
- `search_errors`: `app:liftgo-erp` agrupado por issue/release/ambiente (14d); `release:liftgo@*` (48h); `url.domain:*liftgo*` (14d, sin resultados).
- `get_sentry_resource` en G, M, K, F, C, J, E y B (último evento de cada uno).

## Release 8.44.31 y últimas 48 horas
- **Ningún evento con `liftgo@8.44.31`** en los datos consultados.
- En las últimas 48 horas hubo 3 eventos, todos de releases anteriores: G (8.44.16), K (8.44.27) y M (8.44.25). El último fue el 2026-10-22 a las 04:48 UTC.
- Que no haya eventos en 8.44.31 no prueba que estén corregidos: puede deberse a poco tráfico.

## Resumen priorizado

### 1. Fallos reales, prioridad alta
- **LIFTGO-G / J / H — "reading 'component'".** Ocurre al cargar una ruta diferida del enrutador; el error sale de router-compat-url y del cargador `lazy`.
  - G: 3 eventos, 2 usuarios, release 8.44.16, ruta `/settings/operations`, fase render. Primero 10-20, último 10-21 21:49.
  - J: 1 evento, 8.44.18, ruta `/`, sin manejar. React tuvo que repetir el render de forma síncrona.
  - H: 1 evento, 10-21; no se abrió su detalle.
  - Causa probable (certeza media): el navegador pide un fragmento de la app que ya no existe tras publicar una versión nueva (pestaña con versión vieja), o hay una ruta sin componente resuelto.
  - Cómo reproducirlo: abrir la app en una versión, publicar otra y navegar a una ruta que aún no se había cargado.
- **LIFTGO-C / M — "reading 'default'" en `React.lazy`.** Es el mismo patrón: el módulo diferido se resolvió sin export por defecto.
  - C: 2 eventos, 2 usuarios, 8.44.4 y 8.44.5, ruta `/quotes/:id`. Primero 10-18, último 10-20.
  - M: 1 evento, 8.44.25, ruta `/`, el 10-22.
  - Certeza media: comparte causa probable con G (fragmento obsoleto o ausente después de publicar).

### 2. Compatibilidad de navegador, prioridad media
- **LIFTGO-K — `crypto.randomUUID is not a function`.** El 10-22 02:27, release 8.44.27, ruta `/`, sin manejar.
  - Lo lanza AuthContext al crear el identificador de sesión, durante INITIAL_SESSION.
  - Certeza alta: el navegador no ofrece `randomUUID` (es antiguo o la página no está en un contexto seguro). La zona horaria UTC y la ubicación en EE. UU. sugieren un robot o rastreador, pero no está confirmado.
  - Siguiente paso: usar una alternativa a `randomUUID` cuando no exista.

### 3. Errores de permisos o de usuario reportados como incidentes
- **LIFTGO-F — "Forbidden".** P0001, rol dispatcher, ruta `/income-statement`, 8.44.15, 10-20.
  - Al parecer es un bloqueo esperado por rol, pero se reportó como DB_PERMISSION_DENIED.
  - Certeza media: es ruido de clasificación, no un fallo. Revisar si el menú permite llegar a esa página con ese rol.
- **LIFTGO-A — "permission denied for table supplier_bills".** 8.44.4, 10-14.
  - No se abrió su detalle en esta revisión. Es un permiso real de la base de datos; sigue pendiente revisar los accesos a cuentas por pagar.
- **LIFTGO-E — "Rango de fechas inválido".** Código 22023, ruta `/bookings/new`, 8.44.13, 10-19.
  - Es una validación de captura del usuario. Debería tratarse como error esperado y no enviarse a Sentry.

### 4. Red y sesión, causa no determinada
- **LIFTGO-B — AuthRetryableFetchError "Failed to fetch".** Inicio de sesión del portal, status 0, 8.44.5, 10-18.
  - Que el estado sea 0 no prueba un problema de internet del usuario: también puede deberse a CORS, a un bloqueador o a que el servicio no estaba disponible.
  - Zona horaria UTC: podría ser un robot.
- **LIFTGO-D — "Unauthorized: Invalid token".** 10-18. No se abrió su detalle en esta revisión.
  - Su texto coincide con los errores de sesión expirada que se reconocieron en una corrección anterior. Que haya dejado de aparecer no prueba que esté arreglado.

## Lista completa (11 issues abiertos, todos con subestado new)
| ID | Eventos (14d) | Usuarios | Último | Release |
|---|---|---|---|---|
| [LIFTGO-M](https://elogistix.sentry.io/issues/LIFTGO-M) | 1 | 0 | 10-22 | 8.44.25 |
| [LIFTGO-K](https://elogistix.sentry.io/issues/LIFTGO-K) | 1 | 0 | 10-22 | 8.44.27 |
| [LIFTGO-G](https://elogistix.sentry.io/issues/LIFTGO-G) | 3 | 2 | 10-21 | 8.44.16 |
| [LIFTGO-J](https://elogistix.sentry.io/issues/LIFTGO-J) | 1 | 0 | 10-21 | 8.44.18 |
| [LIFTGO-H](https://elogistix.sentry.io/issues/LIFTGO-H) | 1 | 0 | 10-21 | sin verificar |
| [LIFTGO-F](https://elogistix.sentry.io/issues/LIFTGO-F) | 1 | 1 | 10-20 | 8.44.15 |
| [LIFTGO-C](https://elogistix.sentry.io/issues/LIFTGO-C) | 2 | 2 | 10-20 | 8.44.4 y 8.44.5 |
| [LIFTGO-E](https://elogistix.sentry.io/issues/LIFTGO-E) | 1 | 1 | 10-19 | 8.44.13 |
| [LIFTGO-D](https://elogistix.sentry.io/issues/LIFTGO-D) | 1 | 1 | 10-18 | sin verificar |
| [LIFTGO-B](https://elogistix.sentry.io/issues/LIFTGO-B) | 1 | 0 | 10-18 | 8.44.5 |
| [LIFTGO-A](https://elogistix.sentry.io/issues/LIFTGO-A) | 1 | 1 | 10-14 | 8.44.4 |

Todos los eventos son del ambiente production.

Fuera de la lista de abiertos, el conteo por release mostró **LIFTGO-8** (5 eventos) y **LIFTGO-9** (1 evento), de la release 8.43.19, dentro de la ventana. No aparecen como abiertos, así que probablemente están archivados o resueltos. No se revisaron.

## Limitaciones
- No se pudo separar el sitio publicado de la vista previa porque el dominio no se guarda en los eventos.
- No se abrieron los detalles de H, D y A. Su release y su pila no se verificaron en esta revisión.
- Los breadcrumbs no se capturan por diseño: se descartan los de clics, captura de texto y consola. La pila de componentes de React está filtrada.
- Las pilas apuntan a archivos minificados. Sin mapas de código cargados, no hay marcos de la aplicación legibles.
- Los recuentos dentro de la ventana salen de `search_errors`; los de la lista de issues son totales del período.
- No se usó como evidencia el incidente GitHub #318 (eventos de hosting bloqueados en smoke), porque no está en Sentry.

## Próximos pasos sugeridos (no ejecutados)
1. Fragmentos obsoletos (G, J, H, C, M): recargar la app una vez cuando falle la carga de una ruta diferida, y confirmar en Sentry después de la próxima publicación.
2. K: usar una alternativa cuando `crypto.randomUUID` no exista.
3. E y F: dejar de enviar a Sentry las validaciones esperadas (22023 y P0001 por rol).
4. A: revisar los accesos de la tabla de cuentas por pagar.
5. Subir los mapas de código para tener marcos de la aplicación legibles.
