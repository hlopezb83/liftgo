
# Plan: Puesta en marcha de Facturapi para timbrado CFDI 4.0

## Estado actual (ya implementado)

La integración base con Facturapi ya está construida en el proyecto:

- **Edge Functions**: `stamp-cfdi` y `cancel-cfdi` conectadas a `https://www.facturapi.io/v2`, con auth + RBAC (admin/administrativo), validación de UUID y fallback a modo stub.
- **Persistencia de llaves**: tabla `billing_secrets` (lectura sólo vía RPC `get_billing_secrets_status`, escritura por admin), columna `facturapi_invoice_id` en `invoices`, campo `facturapi_mode` en `company_settings`.
- **UI**: `FiscalDataTab` con `PacConfigForm` (toggle test/live, captura enmascarada de API keys, indicador "configurado").
- **Selección de llave**: las Edge Functions eligen `facturapi_test_key` o `facturapi_live_key` según `facturapi_mode`, con fallback a variables de entorno.
- **Cancelación**: incluye advertencia para facturas > $1,000 MXN (requieren aprobación del receptor).
- **Hooks cliente**: `useStampCfdi`, `useCancelCfdi` con invalidación de caché.

Por lo tanto, **no necesitamos código nuevo de integración** — necesitamos completar configuración, validación end-to-end y endurecer flujos.

---

## Fase 1 — Onboarding de la organización en Facturapi (sin código)

Trabajo del usuario en el panel de Facturapi:

1. Crear cuenta en Facturapi (https://facturapi.io).
2. Dar de alta la **organización emisora** con sus datos fiscales reales (RFC, razón social, régimen, código postal de lugar de expedición).
3. Subir los **CSD (certificados sello digital)** del SAT: archivos `.cer`, `.key` y contraseña.
4. Obtener:
   - `FACTURAPI_TEST_KEY` (modo sandbox, no genera CFDI ante el SAT)
   - `FACTURAPI_LIVE_KEY` (modo producción, timbra ante el SAT — consume folios)
5. Confirmar plan de timbres contratado.

Entregable: las dos API keys capturadas en `Operaciones → Datos Fiscales → PAC` desde la UI ya existente.

---

## Fase 2 — Validación end-to-end en sandbox

Pruebas manuales con `facturapi_mode = "test"` y `FACTURAPI_TEST_KEY` configurada:

1. **Datos fiscales del emisor completos** (RFC, razón social, régimen fiscal, lugar de expedición).
2. **Crear factura de prueba** con cliente que tenga RFC, régimen y CP válidos (incluyendo el caso "Público en General" → `XAXX010101000`, régimen `616`, CP del emisor).
3. **Timbrar** y verificar:
   - Respuesta `stub: false` (real, no fallback)
   - `cfdi_uuid` y `facturapi_invoice_id` persistidos en `invoices`
   - `cfdi_xml` descargado y guardado
   - `cfdi_status = 'stamped'`
4. **Descargar PDF** y validar que el XML se vea correctamente.
5. **Cancelar** la factura de prueba y verificar `cfdi_status = 'cancelled'`, `cancelled_at` y `cancellation_reason` poblados.
6. **Caso de error**: timbrar con RFC inválido → confirmar que `cfdi_status = 'error'` y `cfdi_error_message` se guarda.

---

## Fase 3 — Ajustes menores recomendados (código pequeño)

Mejoras pre-producción detectadas al revisar `stamp-cfdi/index.ts` y la UI:

1. **Validación pre-timbrado en UI**: deshabilitar el botón "Timbrar CFDI" si faltan datos fiscales del emisor o del receptor (RFC, régimen, CP). Hoy se envía y falla en Facturapi.
2. **Mapeo de errores de Facturapi → español**: el `cfdi_error_message` actual guarda la respuesta cruda en inglés. Agregar traducción de los códigos más comunes (`CFDI40101`, `CFDI40102`, etc.) en `errorCatalog.ts`.
3. **Forma de pago / Uso CFDI**: validar en el form que los catálogos `forma_pago`, `metodo_pago`, `uso_cfdi` (ya en `satCatalogs.ts`) sean obligatorios antes de timbrar.
4. **Folios y serie**: confirmar que `useNextInvoiceNumber` genera folio único por serie, ya que Facturapi rechaza duplicados.
5. **Indicador visual de modo** en el header de la página de facturas (`Modo: SANDBOX` en amarillo / `Modo: PRODUCCIÓN` en verde) para evitar timbrar real por error.

---

## Fase 4 — Salto a producción (`facturapi_mode = "live"`)

1. Cambiar toggle a "Producción" en `Datos Fiscales → PAC` (solo admin).
2. Capturar `FACTURAPI_LIVE_KEY`.
3. Realizar **una factura piloto real** con monto bajo a cliente interno.
4. Validar el CFDI ante el SAT (consulta en https://verificacfdi.facturaelectronica.sat.gob.mx con el UUID).
5. Activar timbrado para todos los usuarios `admin` / `administrativo`.

---

## Fase 5 — Operación continua

- Monitorear logs de las Edge Functions `stamp-cfdi` y `cancel-cfdi` desde Lovable Cloud.
- Alertar cuando `cfdi_status = 'error'` (ya hay infraestructura de notificaciones).
- Renovar CSD del SAT antes de que venza (válido 4 años) — recordatorio en `OperationsSetupPage`.
- Conciliar saldo de timbres en Facturapi al menos mensualmente.

---

## Riesgos y bloqueos

| Riesgo | Mitigación |
|---|---|
| CSD vencido o mal cargado | Validar en Fase 1 antes de comprar timbres |
| Catálogos SAT desactualizados (régimen, uso CFDI) | Ya está versionado en `satCatalogs.ts`, revisar trimestralmente |
| Cancelación de facturas > $1,000 requiere aprobación del receptor | Ya se advierte en la respuesta; documentar en manual |
| Llave LIVE filtrada | Llaves guardadas en `billing_secrets` con RLS admin-only y nunca se devuelven al cliente ✅ |

---

## ¿Qué hacemos ahora?

Las tareas inmediatas son **del usuario** (Fase 1 y Fase 2). En cuanto confirmes:

- **Opción A**: "Ya tengo cuenta y llave TEST" → procedo con Fase 3 (ajustes UI/validación) y guío Fase 2.
- **Opción B**: "Empieza por los ajustes de UI de la Fase 3" → implemento las 5 mejoras en paralelo a tu setup de cuenta.
- **Opción C**: "Solo dame el checklist de Fase 1" → exporto un documento guía sin tocar código.
