# Prueba fiscal completa en Preview: arquitectura mínima y decisiones pendientes

Este documento sólo describe la investigación. No hay código, invocaciones, SQL, datos ni publicación. El preflight sigue apagado.

## Resumen para el usuario

Los manejadores fiscales reales del candidato (factura, REP, NC, cancelar, descargar) se pueden reutilizar desde la vista previa sin crear Edge Functions nuevas. No requieren cambiar su lógica: basta con adaptar cómo se conectan (imports, variables de entorno, cómo se crea el cliente del SDK).

Antes de una prueba real faltan cinco cosas y hay un riesgo que obliga a tomar una decisión:

- **Faltan:**
  1. Fixtures de 2 facturas, REP y NC.
  2. Conectar las fases y los claims al punto de entrada.
  3. Descargar el PDF; hoy sólo se descarga el XML.
  4. El manejador de refresco de cancelación.
  5. Un cierre exitoso explícito.
- **Riesgo que exige decisión:** dos tareas automáticas cada 5 minutos (reintentos y reconciliación) recorren todas las empresas. Podrían tomar los documentos sandbox y procesarlos fuera del run.

## Hallazgos verificados (sólo lectura)

### Manejadores auténticos del snapshot 967ac99

Rutas relativas a `qa/facturapi6-sandbox-candidate/snapshot/supabase/functions/`.

| Operación | Manejador | Frontera |
|---|---|---|
| Factura | `stamp-cfdi/handler.ts` `handleStampCfdi(req, deps)` | Request/Response con deps |
| REP | `stamp-payment-complement/handler.ts` `handleStampPaymentComplement` | igual |
| NC | `stamp-credit-note/handler.ts` `handleStampCreditNote` | igual |
| Cancelar | `cancel-cfdi/handler.ts` `handleCancelCfdi` | igual |
| Descargar | `download-cfdi/handler.ts` `handleDownloadCfdi` | igual |

- **Sin `Deno.serve` propio:** ningún manejador tiene `Deno.serve`. El único está en `runner/index.ts`.
- **Imports directos:** todos son relativos. No hay imports `jsr:`, `npm:` ni de URL directamente en los handlers.
- **Deno de nivel superior:** `_shared/cors.ts:10` lee `Deno.env.get("ALLOWED_ORIGINS")` al importarse.
- **Cliente de base de datos:** `_shared/supabaseClients.ts` importa `https://esm.sh/@supabase/supabase-js@2.118.0` y lee `Deno.env` dentro de una función.
- **SDK:** se importa como `"facturapi"` y se resuelve a `npm:facturapi@6.0.0` en el candidato. El operativo usa `npm:facturapi@5.2.0`. La app usa el alias `facturapi6-preview`, que no altera el SDK operativo.
- **Web Crypto:** `crypto.randomUUID` y `crypto.subtle.digest` son estándar, no exclusivos de Deno.
- **Idempotencia y persistencia ERP:** están dentro de cada manejador, mediante updates condicionales y RPCs de claim (`prepare_payment_complement`, `claim_credit_note_for_stamping`). Los claims del run en Storage (`runner/claims.ts`) son una segunda capa.

### Estado del runner

| Requisito | Estado |
|---|---|
| Tenant fijo ELOGISTIX, 116 MXN, cantidad 1, máximo 4 CFDI | Presente (`runner/policy.ts`) |
| 2 facturas + REP + NC | Falta: el esquema de fixtures tiene una sola `invoice_id` |
| Creación de fixtures ERP | Falta; el README lo documenta |
| Validar renglones reales de la base | Falta: hoy sólo valida metadatos del fixture |
| Claims durables en Storage (`upsert:false`, incierto lanza error) | Implementado, pero `DURABLE_CLAIMS_GUARANTEED=false` |
| Sin reintento ante resultado incierto: el run se deshabilita | Implementado en `runWritePhase` |
| Fases conectadas al punto de entrada | Falta: `index.ts` sólo llama al preflight |
| Descarga PDF y XML | Parcial: sólo XML |
| Refresco de cancelación | Falta en el candidato; existe en el operativo `refresh-cancellation-status/handler.ts` |
| Cierre exitoso explícito | Falta; sólo existe `disabled.json` ante fallo |
| `WRITE_PHASES_ENABLED` | `false` |

### Interferencia operativa

- El cron de reintentos y el de reconciliación de timbrado corren cada 5 minutos (migraciones `20260721000000_retry_queue_cron.sql` y `20260831203519_…`).
- La reconciliación procesa todas las organizaciones e incluye facturas, REP y NC atascados.
- El manejador de factura del candidato puede encolar en `cfdi_retry_queue` (`stamp-cfdi/handler.ts:415`). Eso contradice la afirmación del README de que las fases no encolan.
- No pude leer el estado actual de cron: el acceso de lectura no tiene permiso sobre el esquema `cron`. Se infiere de las migraciones, sin verificarlo en vivo.

## Arquitectura mínima viable soportada

```text
Pantalla QA (vista previa en vivo, una acción por clic)
   -> createServerFn (patrón ya revisado: DEV, origen exacto, sesión/admin/tenant, TTL)
      -> despachador de fases (portado de runner/phases.ts)
         -> claim durable en Storage antes del efecto
         -> manejador auténtico del snapshot, sin cambios de lógica
              deps: cliente de sesión, cliente de servicio, env inyectado, cliente SDK 6 inyectado
         -> deshabilitar el run ante resultado incierto, sin reintento
```

### Adaptaciones mecánicas, sin cambio de lógica

1. Hacer una copia vendorizada del snapshot que conserve los manejadores byte a byte. Una prueba de manifiesto debe comparar las huellas con 967ac99.
2. Reescribir sólo los imports: `facturapi` pasa al alias npm 6.0.0 y `esm.sh` supabase-js pasa al paquete npm de la app, con la misma versión o una equivalente documentada.
3. Sustituir `cors.ts`, para quitar `Deno.env` de nivel superior, y `supabaseClients.ts` por adaptadores que reciban los valores por inyección. Las diferencias quedan listadas en un documento de adaptaciones.

### Requieren cambio semántico (decisión del revisor)

- **Fábrica de cliente SDK inyectable:** factura (`invoiceGateway.ts`), REP, NC y cancelar crean el cliente SDK internamente. Sin un parámetro de fábrica, el `guardedFetch` del runner no cubre esas llamadas.
- **Política de reintentos:** el creador no reintenta y la descarga sí. Hay que conservar esa diferencia en lugar de imponer "sin reintentos" global.
- **Validación de fixtures contra renglones reales** antes de cada efecto: cantidad 1, 116 MXN y tenant fijo.

### Pruebas de paridad necesarias (offline)

- Huellas de los manejadores iguales al snapshot.
- Las mismas pruebas de contrato SDK 6 (`sdk6_contract_test.ts`) corriendo bajo Vitest con dobles.
- Para cada manejador: con las mismas entradas y dobles, misma secuencia de llamadas a la base y al SDK y mismo estado y cuerpo de respuesta que bajo Deno.
- Claims: conflicto, incierto y deshabilitado; con eso, cero llamadas al proveedor.
- TTL revisado después de cada `await` antes de cualquier efecto.

### Límite de evidencia

Un éxito en este camino prueba los manejadores auténticos sobre el runtime de servidor de TanStack con SDK 6. **No** prueba el runtime Deno ni el despliegue Edge, y así debe quedar escrito en el README y en el registro de resultados.

## Decisiones y autorizaciones adicionales requeridas

1. **Tareas automáticas globales (inevitable):** elegir una opción. B y C cambian algo operativo y requieren autorización expresa.
   - **A. Sin cambios:** aceptar que la reconciliación y los reintentos pueden tocar los documentos sandbox. Hay que documentarlo y vigilarlo.
   - **B. Pausar ambos crons durante la ventana:** es un cambio operativo temporal y afecta a todas las empresas.
   - **C. Excluir el tenant sandbox en esas funciones:** cambia funciones operativas y requiere despliegue.
2. **Fixtures:** crear 2 facturas, 1 pago y una NC de prueba en el tenant ELOGISTIX es escritura ERP y requiere autorización separada. También hay que definir si se crean por la interfaz normal o con un paso dedicado.
3. **Refresco de cancelación:** incorporar al conjunto revisado una copia del manejador operativo. Requiere revisión nueva de ese archivo.
4. **Inyección del SDK (punto anterior):** aceptar un cambio mínimo de firma en cuatro manejadores o rechazarlo. Si se rechaza, el filtro de hosts no se puede garantizar.
5. **Claims durables:** pasar `DURABLE_CLAIMS_GUARANTEED` a true sólo después de verificar el bucket privado existente `cfdi-files` sin ampliar permisos.

## Fuera de alcance

Edge Functions nuevas, reutilizar endpoints operativos, tocar despliegues, migraciones, permisos, publicación y activar el preflight.

## Siguiente paso propuesto

Si se aprueba este plan, el siguiente turno prepara sólo dos cosas: la copia vendorizada con adaptaciones mecánicas y las pruebas de paridad offline, todo apagado. Las decisiones 1 a 5 se resuelven antes de cualquier escritura.
