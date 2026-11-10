# Fase 3: cierre de arquitectura antes de preparar el ejecutor

10/11/2026. Sólo preparación offline. **NO-GO: no activar ni desplegar.**

## 1. Evidencia reproducible de imports

`IMPORT_AUDIT.json` recorre cinco handlers del snapshot PR438 `967ac99ce632c284fc35f9a7a62852ab4fd09dcf` y el refresco actual, por separado. Registra SHA-256, imports y líneas de marcadores, nunca código completo ni valores de entorno. Resultado: **46 archivos locales, 0 imports relativos faltantes**, único specifier externo encontrado: `facturapi`.

Limitación: es una heurística sobre literales, no parser TypeScript ni cierre del paquete npm. No resuelve imports calculados ni certifica compilación, ausencia de efectos o portabilidad. Un marcador puede ser un comentario: en `download-cfdi/handler.ts:324`, `Deno.env` sólo aparece como explicación. El acceso ejecutable identificado está en `_shared/cors.ts:10`, a nivel de módulo, tanto en snapshot como en código actual.

El import map del snapshot fija `facturapi` a `npm:facturapi@6.0.0`; también declara `@sentry/deno` y `@std/assert` (JSR), pero no aparecen en este cierre de handlers. No importar `index.ts`, `supabaseClients.ts` ni el entrypoint del runner por conveniencia: pueden añadir bootstrap Deno/HTTP/telemetría. Ausencia de `serve` en estos handlers no implica ausencia en los entrypoints excluidos.

El refresco procede de `supabase/functions/refresh-cancellation-status/handler.ts`, digest `d8e04365ebbe9c32bb76529173f8b92662d1106ea93e82ba9b277ce0ae89c8d1`. Su cierre actual alcanza **SDK 5.2**, no SDK 6: la copia QA deberá remapearlo a la capa 6 revisada y volver a comprobar la paridad. Nunca modificar el refresco operativo para esta prueba.

## 2. Adaptaciones y clasificación

| Punto | Adaptación propuesta, todavía no implementada | Evidencia necesaria |
|---|---|---|
| Imports relativos `.ts` y alias `facturapi` | Copia QA con procedencia; alias npm 6.0.0 exacto sólo en esa copia | Cierre de bundles y contrato ESM/CJS, sin cambiar SDK operativo |
| CORS a nivel de módulo | Sustituir sólo en copia QA por dependencia sin lectura global; transporte RPC es same-origin | Revisión de boundary; conservar respuestas de negocio, no heredar regex CORS como autorización |
| `Request/Response` internos | Adaptador interno al handler auténtico; devolver DTO mínimo al RPC | Método, cuerpo, autenticación y códigos equivalentes; no retornar streams/Response/tokens |
| Clientes/env inyectados | Cliente de sesión verificada y privilegios cargados sólo tras tenant/admin/ventana; entorno limitado | Filtros/RPC exactos y cero privilegios antes de autorización |
| Fechas/errores/binarios SDK | Reusar capa 6 candidata, normalizar en frontera sin alterar sellos ni fechas calendario | Mismas escrituras y códigos; PDF/XML reales sólo en la fase autorizada |
| Red del SDK | SDK usa `globalThis.fetch`; `deps.fetchImpl` no intercepta por sí solo todas las llamadas SDK | No sustituir fetch global en servidor compartido; transporte por instancia soportado o gate por llamada, timeout/AbortSignal reales |
| Configuración fiscal | Capa auténtica selecciona `facturapi_test_key, facturapi_live_key` (`client.ts:198–212`) | **Bloqueo:** wrapper de consulta no evita traer livekey si sólo filtra resultado después. Requiere lectura test-only QA explícita y paridad, sin enumeración/fallback ni secretos en URL |
| Exclusividad heredada | `client.ts:224–228` compara `.eq(keyColumn, dbKey)` y consulta otro tenant | **Bloqueo adicional:** secreto en URL PostgREST. La copia QA debe usar el RPC booleano ya revisado, sin parámetro secreto ni devolver otros IDs; no invocar ahora ni modificar SQL/operativo |
| Reintentos/colas | Preservar handlers y observar efectos; no silenciar encolado para fingir paridad | Incierto = cerrar, no repetir; pausa/contención antes de restaurar crons |
| Logs históricos | Hay `console` en handlers y helpers; no garantiza saneamiento el DTO externo | Revisar cada log/error y consultas secretas antes de habilitar; no monkeypatch global de console |

Cambiar import map o tipos de transporte puede ser mecánico; cambiar lectura de configuración, transporte del SDK, logging, reintentos o persistencia afecta comportamiento/seguridad y requiere revisión explícita de la copia QA. No afirmar identidad byte a byte tras esas adaptaciones. No crear flujo paralelo que timbre directamente con el SDK.

## 3. Matriz mínima de paridad de handlers

| Handler auténtico | Contrato a comparar con los mismos dobles | Casos negativos indispensables |
|---|---|---|
| `handleStampCfdi` + gateway | Payload, idempotencia, estado/folio/fechas, `assign_stamped_invoice_number` (`handler.ts:637`) | Respuesta pending/failed, PAC exitoso + persistencia fallida, duplicado |
| `handleStampPaymentComplement` | `claim_payment_rep_stamping` (:230), `prepare_payment_complement` (:288), impuestos, parcialidad y folio REP | Claim fallido, pago duplicado, estado incierto, folio no asignado |
| `handleStampCreditNote` | `claim_credit_note_for_stamping` (:152), origen/relación, `assign_stamped_credit_note_number` (:747), archivos/saldo | Sobreatribución, relación ajena, persistencia tardía |
| `handleCancelCfdi` | `assert_invoice_cancellable` (:144), motivo 02 sólo B, estado PAC/SAT y ERP | Pendiente/rechazado/expired no inventan aceptación |
| `handleDownloadCfdi` | PDF/XML de factura, REP y NC, metadatos/Storage, rutas y tipo/UUID | Vínculo cruzado, binario vacío, timeout, subida tardía |
| `handleRefreshCancellation` | Selección por tipo (:80–93), retrieve/update-status SDK, update ERP (:263), mismo resultado con capa 6 | Estado desconocido, pending, ausencia y error de update |

Las líneas de snapshot son relativas a `qa/facturapi6-sandbox-candidate/snapshot/supabase/functions/`. Pruebas futuras deben ejecutar el **mismo adaptador conectado** al wrapper, con fake fetch y DB/Storage que afirmen proyección, filtros por tenant/documento, parámetros RPC y orden de escrituras. Comparar respuesta HTTP sola es insuficiente. Las 13 pruebas de Fase 2 sólo acreditan la capa SDK; esta matriz sigue pendiente.

## 4. Un claim de run no resuelve la concurrencia de etapas

`runner/claims.ts:53–99` permite create-once de objetos con `upsert:false`; no contiene compare-and-swap de estado ni transacción multiobjeto. Leer cierre y luego reservar tiene una carrera. Dos solicitudes que lean la misma etapa pueden avanzar simultáneamente si escriben objetos diferentes. El doble en memoria no demuestra atomicidad del servicio real.

Diseño mínimo a revisar: un único claim raíz inmutable de run, diario append-only con reservas deterministas por etapa y resultado durable; una etapa sólo acepta la anterior confirmada y reserva antes del efecto. Un resultado perdido o incierto consume esa reserva y prohíbe repetir/reanudar. Son escrituras técnicas adicionales futuras, no otro claim independiente de run; requieren aceptación de esta distinción y revisión de permisos/atomicidad/contención con mecanismos existentes. Si se exige literalmente un solo objeto y cero reservas de etapa, **no hay mecanismo de exclusión acreditado para varias peticiones**: detener, no usar memoria/localStorage.

El cierre tampoco cancela mágicamente un efecto ya enviado. Revisar nuevamente TTL/shutdown tras imports y awaits y antes de operaciones. Una llamada ya iniciada puede terminar después; sin señal efectiva no se promete abortarla. No garantizar supervivencia a desconexión, exactamente una emisión, ni ejecución en segundo plano.

## 5. Secuencia viable condicionada y bloqueos

Solicitudes manuales acotadas: claim/fixtures → A → B → pago/REP A → NC A → PDF/XML por documento/formato → cancelar B → refrescar B → cierre. Máximo cuatro CFDI, no máximo cuatro solicitudes. Sin envío al montar, automatización, reanudación o reintento incierto. Duración hard Preview desconocida; esta fragmentación reduce exposición, no garantiza que cada operación quepa.

El runner previo (`phases.ts:28–38,99–189`) sólo tiene una factura, tres emisiones, una descarga XML y refresco `null`; su repetición de factura no pertenece a la secuencia aprobada. No instalarlo ni activar sus banderas.

Antes de ejecutar faltan: paridad completa de adaptadores; lectura test-only y transporte SDK/logs seguros; diario durable con exclusión demostrada; fixtures ERP y receptor ficticio revisados; pausa/restauración y contención de colas; nueva ventana y revisión independiente del manifiesto final. Los crons sólo se inspeccionaron en código, no se verificó ni alteró su estado real.

Contraste independiente local: 39/39 archivos del manifiesto snapshot y 13/13 del runner coinciden con sus digests. Esto prueba consistencia local, no autentica el archivo upstream. El informe externo de revisión sugirió un update optimista en refresh; el archivo local revisado realmente actualiza sólo por `id` (:263–266), sin compare-and-swap por `updated_at`: no atribuirle esa protección. La semántica completa de RPC/triggers permanece pendiente de auditoría acotada de código SQL, sin ejecutar consultas ni migraciones.

Ninguno de estos puntos autoriza nuevas Edge Functions, SQL/permisos, cambios operativos ni activación. Una ejecución en Preview demostraría ERP + SDK 6 en ese entorno, **no runtime Deno integral ni producción**. Activación productiva posterior: todo de una vez, sin bandera por empresa y con reversa por redeploy.

## 6. Avance parcial posterior — 10/11/2026

`adaptation/` prepara la copia local y el resolver QA conectado a la capa auténtica. Los seis handlers conservan bytes; refresh remapea sus shared a SDK 6. CORS deja de leer entorno al cargar. 20/20 pruebas focales TypeScript y 3/3 de procedencia pasan; no demuestran paridad fiscal autenticada ni persistencia completa. La matriz anterior describe todavía los criterios pendientes.

Inspección del paquete 6.0.0 confirma fetch global sin opción por instancia. Se detuvo ese punto según el plan: fábrica de cliente QA bloqueada antes de red, sin alternativa SDK/HTTP ni monkeypatch global. El resolver ya no lee livekey ni compara secretos en URL; esto no resuelve TOCTOU, logs, diario durable ni transporte. Ver `adaptation/README.md` para fuentes y decisión necesaria antes de continuar.