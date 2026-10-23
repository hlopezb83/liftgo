# B2: frontera fiscal mínima de la factura I

## Alcance

Se extrajo únicamente el mapper puro `buildInvoicePayload` y un gateway PAC de
`tres operaciones` (`create`, `downloadXml`, `downloadPdf`) para `stamp-cfdi`.
No se reescribió el caso de uso ni se creó una capa genérica de repositorios,
framework de jobs o máquina de estados. NC, REP, reconciliación, SQL,
recurrencias y las reglas monetarias de UI/Edge permanecen sin cambios.

Quitar sólo `fetchImpl` habría eliminado una dependencia muerta, pero no habría
permitido probar el handler sin interceptar el transporte global del SDK. Se
sustituyó por una fábrica de gateway obligatoria, enlazada en `index.ts`. La
fábrica se invoca en el mismo punto que el constructor anterior, tras resolver
credenciales y modo, y después de auth, tenant, idempotencia y claim.

## Contratos preservados

- La construcción de partidas mantiene cantidades por defecto, claves SAT,
  ObjetoImp, tasa por línea, descuentos y su redondeo individual. No se
  redondean precios ni se comparten helpers monetarios con la UI.
- Se conserva el orden de validación: RFC, datos fiscales, régimen,
  compatibilidad de uso, campos globales, FX y periodicidad global. El resultado
  puro transporta por separado el mensaje HTTP y el de compensación, que ya eran
  distintos en algunos casos.
- El handler sigue siendo dueño de autenticación, organización, claim, HTTP,
  timeout de 30 segundos, clasificación de error, cola, identidad fiscal,
  Storage, varianza, persistencia final, folio y compensación.
- La creación PAC mantiene el mismo payload, `external_id`, `idempotency_key` y
  `AbortSignal`, sin retry de creación dentro del gateway.
- Un timeout sigue dejando un resultado incierto (`stamping`, sin retry ciego).
  Una respuesta pendiente conserva el ID remoto y no descarga ni reemite.
- La identidad remota sigue persistiendo antes de XML/PDF. Las descargas
  conservan conversión binaria y retry existentes. Fallos de archivos o guardado
  final no habilitan compensación de un CFDI ya emitido; la varianza conserva
  identidad cancelable.

## Caracterización antes de extraer

El commit `ec083b3b7` añade seis snapshots JSON del payload wire y siete casos
de mensajes/precedencia, ejecutados sobre el handler original de `c29a54c1b`. Se
conservaron estas expectativas después de la extracción. Cubren PPD, descuentos
porcentaje/monto y topes, claves SAT, notas escapadas, tasas mixtas y cero,
moneda extranjera, precios de medio centavo sin redondeo adicional, folio
borrador y facturación global con periodicidad SAT o enum legado.

Se mantienen las pruebas originales de `handler_test.ts`; no se sustituyeron por
pruebas de helpers. El test de recuperación de cola sólo cambia su dependencia
muerta por un gateway prohibido: el guard fiscal debe impedir llegar a él.

## Cobertura y límites

- `invoicePayload_test.ts`: payload y errores contra la caracterización; mapper
  sin mutación del snapshot ni dependencia del SDK.
- `gatewayHandler_test.ts`: gateway falso, `fetch` configurado para fallar,
  snapshots reales consumidos por el handler, orden de operaciones, guardas,
  timeout y fallos posteriores a la emisión. La concurrencia usa respuestas
  sintéticas del claim; **no demuestra concurrencia SQL contra una base real**.
- `invoiceGateway_test.ts`: contrato separado del adaptador con transporte en
  memoria, incluyendo pending/UUID, señal de abort, XML y bytes PDF.
- Pruebas existentes del cliente compartido conservan el contrato de retry y
  normalización binaria.

La verificación de esta fase es local y offline. No se ejecutó SQL, no se
accedió al PAC real ni se emitieron CFDI, no se usaron credenciales reales, no
se cambiaron dependencias y no se desplegó ni publicó ninguna rama.

### Limitación del SDK disponible

El repositorio fija Facturapi **5.2.0**, pero la caché disponible para esta
sesión sólo contiene **5.1.0**. Las pruebas de compatibilidad del adaptador y
del handler legado se ejecutan con un import-map de verificación externo al
repositorio que selecciona esa versión ya cacheada. Esto **no certifica el
adaptador en 5.2.0** y no modifica la dependencia del producto. Antes de
publicación debe ejecutarse la suite focal con el SDK fijado en el entorno
normal de CI.

La frontera inyectada se comprueba adicionalmente con un módulo SDK local cuyo
constructor siempre lanza: los tests de gateway falso no pueden crear un cliente
real. No se conceden permisos de red en ninguna ejecución.

### Resultados locales

- Baseline antes de extraer: **41/41** con Deno 2.9.7 y SDK 5.1.0 cacheado.
- Mapper + handler con gateway falso y constructor SDK prohibido: **30/30**, con
  typecheck, en Deno 2.9.7. El fetch global se configura para fallar si se toca.
- Suite focal final: **86/86**, con typecheck, en Deno 2.9.6 y SDK 5.1.0
  cacheado. Incluye handler legado, snapshots, mapper, gateway falso, adaptador,
  cliente compartido, clasificación de recuperación y recuperación de cola. La
  repetición final usó el runtime local persistente tras perderse el runtime
  temporal.
- `deno check` del entrypoint: pasa con los mismos SDKs locales de
  compatibilidad.
- Dos mutaciones deliberadas fueron detectadas por aserciones, no por errores de
  compilación: reemplazar IVA cero por 16% y omitir la persistencia de UUID
  antes de descargar archivos. Ambas se restauraron antes de la suite final.
- `deno lint` focal, formato y `git diff --check`: pasan. No se ejecutó lint,
  typecheck ni suite global del repositorio.

Para repetir con las dependencias **fijadas del producto**, desde
`supabase/functions` y con la caché de CI preparada:

```sh
deno test --cached-only --allow-env --allow-read \
  stamp-cfdi/handler_test.ts stamp-cfdi/booking_claim_test.ts \
  stamp-cfdi/payloadCharacterization_test.ts stamp-cfdi/invoicePayload_test.ts \
  stamp-cfdi/gatewayHandler_test.ts stamp-cfdi/invoiceGateway_test.ts \
  _shared/facturapi/client_test.ts _shared/facturapi/invoiceRecovery_test.ts \
  process-cfdi-retry-queue/providerRecovery_test.ts
```

Sin `--allow-net`, sin reemplazar la versión 5.2.0 en la configuración del repo.
La ejecución anterior en CI sigue pendiente; los resultados locales no la
sustituyen ni certifican corrección fiscal ante un PAC externo.

### Revisión de consumidores indirectos

La revisión independiente detectó que `CancelCreditNoteDeps` y `CancelRepDeps`
eran aliases de `StampCfdiDeps`. El reemplazo de `fetchImpl` en la factura I
rompía por ello el typecheck de dos entrypoints y dos tests de cancelación. Se
corrigió cada alias mediante una interfaz local con sus cuatro campos legacy:
`createCallerClient`, `createServiceClient`, `fetchImpl` y `env`. No se inyectó
el gateway de emisión de factura en NC/REP ni se cambió su comportamiento.

El check de los diez consumidores directos e indirectos de los tres contratos
pasa. Las dos suites offline de cancelación pasan **42/42** adicionales, con
Deno 2.9.6 y SDK 5.1.0 cacheado. El JavaScript transpileado de ambos handlers de
cancelación es idéntico al anterior al fix de tipos, omitiendo comentarios. Los
smoke tests remotos no se ejecutan. La validación con SDK **5.2.0 exacto en CI
sigue siendo condición de aprobación remota**, no queda dispensada por estas
pruebas de compatibilidad.
