# Diagnóstico de handlers Deno

## Preparación de validación fiscal

`_shared/edgeDiagnostics.ts` define un puerto opcional de diagnóstico. El handler
recibe funciones para identificar al actor y capturar fallos; no importa Sentry
ni controla su inicialización, transporte o envío. Los endpoints publicados
todavía no conectan este puerto a un SDK. Su activación necesita primero el
canario compatible de Cloud descrito en [Sentry](./sentry.md).

`createRequestDiagnostics` conserva identidad local a cada invocación. Resolver
la empresa conserva el actor y rol ya comprobados. Una nueva autenticación
retira la empresa anterior. El callback recibe una copia, para que no pueda
modificar el contexto guardado. Sus fallos se contienen sin repetir el negocio.

## Procedencia del contexto

- `authenticateWithDeps.onAuthenticated` se ejecuta después de verificar claims,
  perfil activo y un rol permitido en `user_roles`. Su resultado de autorización
  y sus consultas se conservan. El rol observado sale de la fila permitida en BD.
- Un servicio verificado identifica `service_role` y no inventa un ID de usuario.
- La empresa se agrega después del resolver existente de membresía/documento.
  No se obtiene de headers, body o un campo empresarial de los claims.
- No se agregan lecturas de autorización, empresa o secretos para el diagnóstico.

## Fallos que se preparan para capturar

`validate-receptor-tax-info` conserva el 502/504 del PAC y entrega fallos técnicos
al puerto. Un cuerpo HTTP del PAC no se entrega al observador. Sus excepciones
inesperadas entregan el error original con el mismo 500 genérico.

`validate-customers-tax-info` hace lo mismo para lecturas, guardados y conteos de
BD. También informa fallos técnicos del PAC dentro de un lote que termina con
HTTP 200. Diferencias fiscales, validaciones y conflictos de revisión mantienen
su flujo de negocio. El eventual SDK limitará incidentes por Request.

Las respuestas y resultados fiscales se conservan. Los logs de sus catches
inesperados dejan de escribir mensajes/objetos crudos; registran una línea
técnica. Las reglas locales de datos faltantes viven en `customerFields.ts`.

## Evidencia y límites

La suite local de preparación pasa 53 pruebas offline: autenticación, estado del
puerto, handlers existentes y diagnósticos. Incluye identidad confirmada,
denegación de documentos ajenos antes de secretos/PAC, consultas iguales con/sin
observador, preservación de resultados/guardados y error del observador sin
repetición del PAC. Las aserciones se realizan fuera de callbacks cuyos errores
se contienen, evitando falsos positivos.

Esto acredita los puntos de diagnóstico y el contrato de negocio. No acredita
recepción, aislamiento del transporte Sentry, mapas o compatibilidad del SDK
con el runtime real de Cloud. Esos pasos siguen en el piloto de Sentry.
