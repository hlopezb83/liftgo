# Migrar el ERP a Facturapi 6.0.0

## Qué es lo más nuevo

- **Versión vigente:** la más reciente en npm es `facturapi@6.0.0`, publicada el 2 nov 2026 (`dist-tags.latest`).
- **Versiones previas:** 5.2.0 (14 oct) y 5.0.0 (10 sep).
- **Etiqueta del changelog:** el CHANGELOG del paquete todavía marca 6.0.0 como "Unreleased", aunque ya está publicada como `latest`.
- **Situación actual del ERP:**
  - Las funciones fiscales en producción usan **5.2.0**.
  - Ya existe un candidato revisado con 6.0.0 (snapshot 967ac99), con pruebas de contrato SDK 6.
  - En la vista previa, la lectura del emisor con 6.0.0 se confirmó una vez.

## Cambios de 6.0.0 que nos afectan

1. **Fechas como `Date`:** las fechas de respuesta llegan como `Date`, pero los sellos SAT y las fechas de calendario siguen como texto. Riesgo: guardar fechas con zona incorrecta o comparar texto contra `Date`.
2. **Tipos más estrictos** en CFDI, complementos (REP), clientes y series. Puede romper la compilación de payloads de factura, REP y NC.
3. **Estados de factura distinguidos** (draft, pending, failed, stamped). Conviene leer el UUID y el sello sólo cuando el estado es `stamped`.
4. **Imports internos prohibidos:** ya no se permite `facturapi/dist/...`; sólo se importa desde `facturapi`.
5. **Otros cambios menores:** borrar un certificado devuelve una fecha, la factura global puede devolver `null` y las series devuelven arreglos.
6. **Novedades útiles:** chequeo de salud del API, `receipts.updateCustomer`, filtros `sat_imported` y la frescura de los ZIP.
7. **Heredadas de v5 que ya debemos respetar:**
   - Búsquedas sin conteos garantizados.
   - Parámetros anidados en las consultas.
   - URLs de descarga temporales.
   - `invoices.paymentSummary` para REP.
   - `FacturapiError` con `status`, `code` y `logId`.

## Estrategia (mejores prácticas)

```text
Fase 0  Inventario y contrato     (sin efecto)
Fase 1  Capa única SDK 6          (código, apagada)
Fase 2  Pruebas de paridad        (sin red)
Fase 3  Sandbox completo          (tenant ELOGISTIX en modo test, con autorización)
Fase 4  Producción gradual        (por empresa, con reversa)
Fase 5  Retiro de 5.2.0
```

### Fase 0: inventario

- Listar todas las llamadas al SDK en las funciones fiscales: 21 archivos usan la capa `_shared/facturapi/client.ts`.
- Clasificar cada uso por riesgo de cambio: fechas, estados, tipos y búsquedas.

### Fase 1: una sola puerta al SDK

- Todo el ERP llama sólo a la capa `client.ts`; nada importa `facturapi` directamente. Partimos del `client.ts` del candidato.
- **Normalización de fechas en la capa:** convertir a ISO UTC antes de guardar, y nunca convertir los sellos SAT ni las fechas de calendario. Mostrar las fechas en hora de México.
- **Errores:** mapear `FacturapiError` a códigos internos y guardar sólo `logId` y `code`, nunca el payload ni la llave.
- **Idempotencia y reintentos:**
  - Mantener los claims en la base de datos y `idempotency_key` en la creación.
  - En timbrado: sin reintento automático si el resultado es incierto; se resuelve con la reconciliación.
  - En descargas y lecturas: los reintentos sí se permiten, con timeout y AbortSignal.
- **Estados:** sólo persistir el UUID y el sello cuando el estado sea `stamped`; `pending` y `failed` pasan a la reconciliación.

### Fase 2: pruebas sin red

- Pruebas de contrato SDK 6: fechas, errores, abort y descargas.
- Paridad 5.2 contra 6.0 por cada función, con los mismos dobles y la misma secuencia de efectos en base de datos.
- Cobertura de las funciones de timbrar, cancelar y descargar factura, REP y NC, más el refresco de cancelación y la reconciliación.

### Fase 3: sandbox completo (requiere autorizaciones ya identificadas)

- Fixtures en el tenant ELOGISTIX: 2 facturas, REP y NC, máximo 4 CFDI, 116 MXN y cantidad 1.
- **Decidir antes qué hacer con los crons globales** de reintentos y reconciliación: aceptar, pausar o excluir el tenant de prueba.
- Una petición por fase, con un claim durable y sin reanudación. El límite de tiempo del servidor en vista previa no está documentado.

### Fase 4: producción gradual

- **Interruptor por empresa:** una bandera en la configuración, con 5.2 por defecto. Requiere una migración aditiva que se revisará en su momento.
- **Orden de activación:** primero una empresa interna, luego un grupo reducido y al final todas.
- **Monitoreo:** errores de timbrado, cola de reintentos y diferencias de fechas, usando Sentry ya integrado.
- **Reversa:** apagar la bandera, sin desplegar de nuevo.

### Fase 5: retiro

- Cuando todas las empresas lleven 2 semanas estables, retirar 5.2.0 del import map y el alias temporal `facturapi6-preview`.
- Borrar la pantalla QA y archivar la función de exclusividad. Para eso ya existe la recuperación sin DROP.

## Decisiones que necesito de ti

1. **Crons durante el sandbox:** ¿aceptar, pausar o excluir el tenant de prueba?
2. **Fixtures:** ¿autorizas crear los documentos de prueba en ELOGISTIX?
3. **Interruptor por empresa:** ¿lo agregamos (lo recomiendo) o se cambia todo de una sola vez?

## Detalles técnicos

- **Fuentes:**
  - Registro npm `facturapi` (`dist-tags.latest = 6.0.0`, publicada 2026-11-02).
  - `CHANGELOG.md` del paquete 6.0.0, que incluye la guía de migración desde v3, v4 y v5 en su README.
- **Archivos clave:**
  - `supabase/functions/deno.json`: hoy mapea a 5.2.0.
  - `supabase/functions/_shared/facturapi/client.ts`: la capa operativa.
  - `qa/facturapi6-sandbox-candidate/snapshot/.../client.ts`: la capa del candidato, con unas 140 líneas de diferencia.
- **Fuera de alcance de este plan:** publicar, invocar funciones fiscales o cambiar permisos sin autorización expresa.
