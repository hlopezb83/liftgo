# Verificación de despliegue de 16 Edge Functions (PR323) — sólo planeación

## Estado observado (lectura, 21/10/2026 18:0x UTC)
- HEAD del sandbox: `7e4688c3e844b983cb828e2e358f700b4bee518a`, descendiente de main `05b52cc7…`. Diferencias sólo en `public/version.json` y `previewAuthStorage.ts` (autogenerados); `supabase/functions/` idéntico a `05b52cc7`.
- Las 16 funciones existen en `supabase/functions/` junto con `_shared`, `deno.json` y `deno.lock`.
- Incidente activo de GitHub en Lovable ("Delays syncing with GitHub"): el merge de PR323 puede tardar en llegar al sandbox.

## Capacidades reales de las herramientas
| Necesidad | ¿Disponible? |
|---|---|
| Desplegar | Sí: `supabase--deploy_edge_functions` recibe sólo `function_names`; usa el checkout actual. Sin SHA, canary ni rollback. Responde éxito/error. |
| Versión/revisión desplegada | No. Ninguna herramienta lista versiones, revision id ni fecha de despliegue. |
| Digest del bundle desplegado | No. No hay descarga del código desplegado ni hash. |
| Logs | Sí: `supabase--edge_function_logs` muestra `function_id`, boot/shutdown y timestamps. `function_id` es estable por función; no cambia por versión. |
| Invocar | Existe, pero está fuera de alcance (prohibido: llamadas PAC/datos). |

Conclusión: no puedo hacer un inventario de versiones actuales ni acreditar el digest desplegado. Sólo puedo probar la identidad del **código fuente que se despliega**, no la del bundle que corre.

## Plan de verificación (para el turno de despliegue autorizado)
1. Pre-check de fuente: `git rev-parse HEAD` igual al merge de PR323 (o descendiente con diff vacío en `supabase/functions/`); árbol limpio; `git rev-parse HEAD:supabase/functions` igual al tree hash esperado del commit CI-verde; sha256 por archivo de cada función + `_shared` + `deno.json`/`deno.lock` contra un manifiesto que entregue el coordinador.
2. Confirmar diff limitado: `git diff 05b52cc7 <merge> -- supabase/functions` sólo toca el guard humano compartido y los handlers fiscales revisados; ramas `service_role`/cron sin cambios (grep de `authenticateCronRequest`/rutas service role sin diff).
3. Despliegue de las 16 en el orden indicado, una llamada por función o por lote; registrar timestamp UTC y respuesta exacta. Sin reintentos ciegos: ante fallo, leer logs antes.
4. Re-verificar fuente inmediatamente después (HEAD y tree hash sin cambio durante el despliegue).
5. Evidencia post-despliegue sólo pasiva: logs de boot naturales posteriores (cron: reconcile cada 5 min, recurrentes en su horario); sin invocar nada.
6. Recibo técnico (sólo en el turno autorizado y si se pide archivo) con HEAD, tree hash, manifiesto sha256, timestamps y respuestas; sin secretos ni datos de clientes.

## Limitaciones
- "Éxito" significa que el despliegue desde este checkout fue aceptado; no hay prueba criptográfica de lo que corre.
- Los boots en logs no se atribuyen a versión; sólo son señal temporal.
- Las funciones de usuario (stamp/cancel/download/validate…) no tienen boot natural sin uso real; no habrá evidencia pasiva hasta que un usuario las use.
- Ventana mixta: durante el despliegue secuencial algunas funciones correrán código nuevo y otras viejo; peticiones en vuelo terminan con la versión anterior.
- Si hace falta digest real, se requiere capacidad de plataforma nueva (listar versiones/hash). Puedo enviar esa solicitud al equipo si lo autorizas.

No se modificó nada en este turno.
