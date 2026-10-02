# Diagnóstico: comprobación Facturapi devuelve `unavailable` con latencia 0

## Evidencia observada
- Logs del servidor publicado (última hora, filtro "facturapi"): sin registros. El `catch` vacío de `checkFacturapiConnection` descarta el error, así que no hay logs que confirmen la causa.
- `wrangler.jsonc`: `compatibility_date` 2026-09-07, `nodejs_compat`. El servidor publicado corre en Cloudflare Workers (workerd), no en Node.
- `latency_ms=0` y `http_status=NULL`: el `fetch` se rechazó casi al instante, antes de cualquier ida y vuelta de red. Por eso apunta a un error al validar las opciones de la petición, no a un timeout (que tardaría 8000 ms) ni a una respuesta HTTP.

## Causa probable (sin confirmar en logs)
- `redirect: "error"`: workerd sólo acepta `"follow"` y `"manual"`. Con `"error"` lanza `TypeError` (en el mensaje conocido de workerd: Invalid redirect value, must be one of "follow" or "manual"). Esto encaja con un rechazo inmediato.
- `cache: "no-store"`: con esta fecha de compatibilidad (posterior a 2024-11-11) workerd lo acepta. Es poco probable que sea la causa.
- `AbortSignal.timeout(8000)`: workerd lo admite.
- Las pruebas de Vitest pasan porque simulan `fetch` en Node, que sí acepta `redirect: "error"`.

## Cambio sugerido en Git (lo haces tú)
1. Usar `redirect: "manual"` y tratar cualquier 3xx como `invalid_response` (cancelando el cuerpo).
2. Opcional: en el `catch`, registrar sólo `error.name` y un código fijo (por ejemplo `TypeError`/`TimeoutError`/`AbortError`), nunca el mensaje, la llave ni las cabeceras.
3. Ajustar la prueba que espera `redirect: "error"` y añadir una para 3xx.

Para confirmarlo antes del cambio, basta el paso 2 desplegado: el siguiente intento mostraría `TypeError` en los logs.
