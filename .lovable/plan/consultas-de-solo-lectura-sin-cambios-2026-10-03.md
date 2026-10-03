# Consultas de solo lectura (sin cambios)

## 1. Deployment 4d7c7e87 (PR #220, v8.43.10)
Ya está activo. `https://liftgo.lovable.app/version.json` (sin caché, 06:48 UTC del 3-oct-2026) devuelve 8.43.10 y la cabecera `x-deployment-id` es `psr2.4d7c7e87-a2c5-451e-a81d-b83f7fa6bbfb...`. No hubo fallo de build ni de publicación. Lo visto como 8.43.9 fue propagación entre "ready" y el cambio de tráfico.

## 2. Versión de Deno / Edge Runtime en Lovable Cloud
No se puede determinar de forma fiable con la evidencia disponible.

- Logs de las funciones (process-cfdi-retry-queue, reconcile-stamping-invoices, 3-oct-2026): solo "booted (time: Nms)" y "shutdown"; no incluyen versión de Deno ni del Edge Runtime.
- Consultas de analítica (function_logs, function_edge_logs): sin filas ni campo de versión de runtime.
- `supabase/functions/deno.json` solo declara `nodeModulesDir` y reglas de lint; no fija versión.
- Deno 2.6.10 es el binario del sandbox de herramientas, NO el runtime de Cloud. No sirve como evidencia.
- Soporte de `node:async_hooks` / AsyncLocalStorage en Cloud: no verificado. El proyecto ya lo usa en el SSR (otro runtime), lo cual no aplica a las Edge Functions.

Dato que falta: la versión de Deno/Edge Runtime que reporte el propio runtime desplegado (por ejemplo `Deno.version` y un `AsyncLocalStorage.run` de prueba dentro de una función), o documentación de Lovable/Supabase con la versión vigente. Obtenerlo exigiría código en una función, que quedó descartado.

## Acciones
Ninguna. No se edita código, datos, secretos ni se publica. No se añadió entrada a roadmap.md porque el modo plan no permite editar otros archivos.
