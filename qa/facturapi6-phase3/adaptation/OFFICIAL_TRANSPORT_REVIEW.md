# SDK oficial conservado: controles por llamada preparados

10/11/2026. **Sólo offline, sin activar.** Conexión parcial posterior en copias mediante fábricas opcionales: ver `WIRING_REVIEW.md`, sin servicios reales.

## Decisión y alcance

Se conserva `facturapi@6.0.0` instalado bajo el alias existente. No se modifica su paquete ni su fetch global. `officialCalls.ts` prepara una vista local del recurso por solicitud: ejecuta los métodos oficiales y añade checkpoint/señal en `resource.client.request`, igual que el patrón interno ya presente en la capa candidata. Esto **no es una opción pública del SDK**; sigue requiriendo revisión del contrato versionado antes de wiring.

No se implementa transporte HTTP alternativo ni se reconstruyen payloads. Los métodos oficiales conservan path, verbo, parámetros y plan de fechas. El checkpoint es inyectado; no acredita por sí mismo sesión/admin/tenant/ventana. La futura frontera debe suministrar esa validación y una señal efectiva.

## Gates y semántica

- Checkpoint + señal antes/después de operación y antes/después del request delegado.
- PDF/XML reciben la misma señal en request; su consumo binario usa helpers auténticos con controles antes/después. Un stream ya enviado sólo se interrumpe si el transporte/cuerpo observa realmente la señal.
- No se agregan retries ni se cambian los históricos de los handlers. Fallo o vencimiento después de una escritura enviada = resultado incierto, nunca permiso para repetir. El helper arroja error; el futuro diario debe conservar evidencia de reserva/envío y bloquear retry. **No conectar sin ese diario.**
- Un checkpoint posterior al consumo no autoriza futuras escrituras: cada await/consulta/subida del futuro adaptador necesita su propia validación. Una subida enviada no se deshace por cerrar la ventana.
- Dos vistas no comparten señal y no mutan el recurso original. No existe estado global de request ni llaves.

## Evidencia

`officialCalls.test.ts` ejecuta la clase/métodos oficiales SDK 6 con `request` sustituido **sólo en instancias ficticias de test**. No usa fetch ni red. Compara lado a lado seis métodos contra los originales, añadiendo únicamente señal; comprueba vencimiento, incompatibilidad, cancelación previa, concurrencia de scopes, cero retry de escritura y consumo tardío sin continuación de persistencia.

Esto prueba delegación y opciones hasta `request`, **no su envío HTTP, conversión real de fechas, abort efectivo del fetch/cuerpo, persistencia ERP ni flujo fiscal autenticado**. La fuente local `node_modules/facturapi6-preview/dist/index.mjs:2433–2441` muestra que las opciones restantes se pasan a fetch; la prueba no sustituye validación integral del transporte. No se ejecutó red proveedor ni prueba de duración.

Evidencia inicial: 10 pruebas nuevas; 20 anteriores de copia/resolver; 3 de procedencia. La continuación agrega wiring parcial y regresión de señal; ver informe. Suite completa pendiente de CI. La fábrica por defecto sigue `QA_TRANSPORT_BLOCKED`; la inyección offline no la desbloquea ni crea endpoint o SDK fuera de tests.

## Pendientes antes de ejecución

Revisión independiente de esta dependencia interna; conexión offline del mismo helper a cada ruta real de handlers/gateway (incluyendo descarga y refresh) y paridad autenticada de sus efectos; saneamiento de logs; diario durable y cierre sin retry; TOCTOU configuración; fixtures ERP/receptor; contención/pausa de crons; ventana fresca. No cambiar SQL, permisos ni funciones operativas para resolverlo silenciosamente.

El preflight conserva `enabled=false`, `shutdown=true`, run y fechas cerrados. Sin base, secretos, proveedor, fiscal, publicación o despliegue. Ninguna evidencia equivale a runtime Deno integral.