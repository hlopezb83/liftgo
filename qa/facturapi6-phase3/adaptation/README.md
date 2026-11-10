# Adaptación parcial offline — NO-GO

10/11/2026. Sin endpoint, pantalla, despliegue ni ventana activa. **No copiar a producción ni conectar un ejecutor.**

## Preparado

- `candidate/`: cierre local de las seis funciones auténticas. Los seis `handler.ts` conservan sus bytes; el refresco actual utiliza ahora, sólo en esta copia, los shared del snapshot SDK 6.
- `PROVENANCE.json`: origen y SHA-256 de cada archivo, más digest de su copia. `prepare_copy.py` reproduce el árbol mediante lectura local; no importa ni ejecuta funciones fiscales.
- Sólo cambian `_shared/cors.ts` (sin lectura de entorno al cargar, sin allowlist heredada) y `_shared/facturapi/client.ts` (alias 6.0.0 existente, resolver QA y transporte bloqueado). CORS interno vacío no autentica ni autoriza.
- `testConfig.ts`: scope por objeto cliente, sin credenciales ni fetch global. Falta scope = bloqueo. Tenant fijo, modo test releído aunque exista override, verificador booleano sin parámetros secretos y proyección sólo `facturapi_test_key`. Sin fallback de entorno ni comparación de la llave en URL. `checkpoint` se ejecuta antes/después de awaits; una operación ya enviada no se aborta mágicamente.
- El scope es dependencia offline, **no frontera de seguridad desplegada**. La futura función debe verificar sesión real, perfil/admin activo, pertenencia, origen exacto, DEV y ventana antes de cargar privilegios. No se creó esa función.

## Cambio semántico explícito

El resolver QA elimina el modo live y el fallback, relee configuración y usa exclusividad booleana. Esto cambia intencionalmente el comportamiento de configuración; no equivale a paridad íntegra. El contrato de error de los handlers se preserva convirtiendo errores QA a `FacturapiConfigError`. TTL se propaga como bloqueo; su traducción al futuro DTO sigue pendiente.

Exclusividad y lectura de llave son dos operaciones distintas: existe TOCTOU si la configuración cambia entre ellas; no se promete atomicidad ni exclusividad de la llave leída bajo cambios concurrentes. No se invocó el RPC existente. El scope de pruebas usa sólo dobles.

## Bloqueo confirmado: transporte SDK

Fuente local verificable: `node_modules/facturapi6-preview/package.json` identifica **6.0.0**. En `dist/index.mjs:2323–2326`, `se()` lee `globalThis.fetch`; `:2433–2441` construye y envía la petición con ese fetch; `:3121–3127` el constructor usa sólo `apiVersion` y `headers`, no un fetch por instancia. No se instaló ni modificó el paquete.

La capa candidata puede añadir `AbortSignal` mediante un recurso acotado (`invoicesWithSignal`), pero no inyectar fetch por instancia con una opción pública del SDK. El gateway todavía descarga PDF/XML sin señal; `deps.fetchImpl` no cubre esas llamadas. No reconstruir HTTP para fingir que es el SDK ni sobrescribir fetch global en servidor compartido. **`createFacturapiClient` en esta copia arroja `QA_TRANSPORT_BLOCKED` antes de crear un cliente.** La clase SDK permanece exportada por compatibilidad, por lo que el árbol no es una frontera ejecutable de seguridad y no debe conectarse directamente.

Decisión pendiente: revisar una adaptación por llamada del transporte interno (API no pública, con contrato versionado), o permitir probar el SDK con su fetch nativo y gates/señales revisados en todas las operaciones. Ambas requieren revisión explícita; ninguna se implementó. Sin esa decisión se detiene la paridad fiscal completa y el wiring de ejecución.

## Evidencia focal y límites

Comandos locales:

```text
python3 -B qa/facturapi6-phase3/adaptation/prepare_copy.py
bun test qa/facturapi6-phase3/adaptation/offline.test.ts
python3 -B -m unittest discover -s qa/facturapi6-phase3/adaptation -p 'test_*.py' -v
```

20/20 pruebas del resolver conectado y rechazos iniciales de los seis handlers; 3/3 de procedencia. Imports ejecutados con Bun sin Deno.env en el cierre, ningún cliente real creado. Los tests usan sólo datos ficticios; no se llamó a red, base, SQL o proveedor. No equivalen a ejecución exitosa autenticada, paridad de escrituras, compilación workerd ni runtime Deno integral. La suite completa queda para CI.

Los paths internos contienen imports `.ts`; Bun los resuelve localmente. No se certifica bundle de publicación, cierre de paquete ni integración `createServerFn`. Los logs históricos permanecen: antes de habilitar hay que sanear errores sin ocultar resultados inciertos, y comparar persistencia/colas auténticas. No se cambiaron handlers para silenciar esos efectos.

## Diario y cierre propuestos, no implementados

Un claim raíz inmutable del run; reservas deterministas create-once para cada etapa; resultado confirmado antes de admitir la siguiente. Reserva sin resultado durable = incierto, cierre y prohibición de retry/reanudación. Cierre consume el run; no cancela efectos ya enviados. Las reservas son escrituras técnicas adicionales y necesitan autorización/revisión del mecanismo existente: Storage simulado no demuestra exclusión atómica real.

No resolver carreras de cierre/reserva mediante sólo leer y luego escribir; falta un mecanismo acreditado que serialice ambas operaciones. No usar memoria o localStorage como evidencia durable. No se implementó conexión Storage, SQL ni permisos.

Pendientes bloqueados: transporte; paridad autenticada completa de payload/fechas/idempotencia/RPC/escrituras/archivos y fallas parciales; logs; contención de colas/crons; diario durable; fixtures ERP/receptor; nueva revisión y ventana. Mantener cuatro CFDI como máximo (A, B, REP A, NC A), 116 MXN/documento y cantidad uno. No ejecutar el runner previo.