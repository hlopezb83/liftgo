
# Auditoría · Toasts y reporte de errores (v6.107.x)

**Alcance:** `src/**` (prod + tests). Solo diagnóstico, sin cambios de código.

## 0. Resumen ejecutivo

- **Cobertura global: excelente.** 472 llamadas `notify*` en producción vs. **0** usos crudos de `toast.success/info/warning/error` fuera de `appFeedback.ts` y `ErrorDetailsDialog.tsx`. La migración iniciada en v6.14–v6.15 y auditada en 2026-06-23 se sostiene.
- **Red de seguridad global activa:** `AppProviders.tsx` cablea `QueryCache.onError` y `MutationCache.onError` → toda query/mutación fallida sin `onError` local dispara `notifyError` con reporte copiable.
- **Opt-out documentado y usado:** `meta.silent = true` presente en `useDeleteUser` y `useInvoices`. Correcto y minimal.
- **Deuda concentrada en 3 vectores** (ninguno crítico): validaciones que usan `notifyError` en vez de `notifyValidation`, `catch {}` que silencian errores en UI no-crítica, y `notifyAsync` disponible pero sin usar en flujos largos.

## 1. Inventario

| Métrica | Valor |
|---|---:|
| Llamadas `notify*` en producción | **472** |
| Llamadas `toast.*` crudas en producción | **0** |
| Archivos que importan `sonner` directo | 3 (solo `appFeedback.ts`, `sonner.tsx`, `ErrorDetailsDialog.tsx`) |
| `notifyError` sin objeto `error` (solo `message`) | **47** |
| `onError` locales en mutaciones | 136 |
| `catch {}` silenciosos en prod | 20 |
| Handlers globales query/mutation | ✅ activos en `AppProviders.tsx` |
| `meta.silent` en producción | 2 (correctos) |

## 2. Hallazgos

### HIGH — Validaciones usando `notifyError` en vez de `notifyValidation`

47 llamadas `notifyError({ message: "..." })` sin objeto `error`. Muestran botón "Ver detalles" persistente aunque no hay stack real que copiar → ruido para soporte. Casos claros de **validación de formulario** que deberían usar `notifyValidation` (warning, 5s, sin acción):

- `src/features/quotes/hooks/quoteForm/quoteFormValidation.ts` — 4 validaciones (`Selecciona un cliente`, `Selecciona el periodo`, `Agrega un modelo…`).
- `src/layouts/sidebar/ChangePasswordDialog.tsx:23,27` — longitud y coincidencia de contraseña.
- `src/components/forms/CsfDropzone.tsx:27,31` — tipo y tamaño de archivo.
- `src/features/bookings/components/bookings/PostBookingPolicyDialog.tsx:32` — proveedor requerido.
- `src/features/suppliers/.../SupplierContactFormDialog.tsx:64`, `SupplierBankAccountFormDialog.tsx:70` — campos requeridos.

**Riesgo si no se corrige:** toasts persistentes con botón "Ver detalles" que abren reportes vacíos → confunde al usuario y a soporte.

**Fix propuesto:** codemod dirigido reemplazando estos casos por `notifyValidation({ message })`. Bajo riesgo (misma superficie visual, solo cambia severidad y duración).

### MEDIUM — Errores reales enmascarados como `message` string

Casos donde sí hay un `error` real pero se pasa concatenado como `message`, perdiendo stack/código Postgres en el reporte:

- `src/features/quotes/hooks/quoteDetail/useQuoteBookingCreator.ts:62` — `message: \`…: ${err.message}\`` en lugar de `{ error: err, message: "…" }`.
- `src/features/audit/hooks/useAuditLogs.ts:92` — `error?.message || "Error al revertir"`.
- `src/features/customers/pages/CustomerDetailPage.tsx:31` (catch de PDF), `src/features/changelog/hooks/useChangelog.ts:16` (query.error).

**Fix propuesto:** pasar `{ error: err, message: "…" }` para que el diálogo de detalles muestre stack real.

### MEDIUM — `catch {}` silenciosos en producción

20 catches sin `notify*` ni `console.warn`. **Legítimos** (parseo defensivo, screenshots, storage seek): 15 aprox. **Sospechosos** (fallan silenciosamente en flujos de usuario):

- `src/features/bookings/components/bookings/ExtendBookingDialog.tsx:27`
- `src/features/damage/hooks/useReportDamageForm.ts:71`
- `src/features/accounts-payable/hooks/useExportPaymentsForm.ts:62`
- `src/features/operations/components/operations/ContractTemplateTab.tsx:60`

**Recomendación:** revisar caso por caso; los legítimos deben llevar comentario `// silent: <razón>` (patrón que ya existe en `StampErrorDialog.tsx:95`).

### LOW — `notifyAsync` disponible sin uso en producción

Cero usos in-tree. Flujos con spinner + posible fallo — timbrado CFDI, generación recurrente, imports XML — podrían beneficiarse de un solo toast con estados loading/success/error consistentes.

**Recomendación:** aplicar a 2–3 flujos piloto (`useImportSupplierBillCfdi`, `stamp-cfdi`, `useGenerateRecurringInvoices`) y evaluar. Sin urgencia.

### LOW — Traducción de errores backend genérica

`src/lib/errors/index.ts` cubre 8 patrones (RLS, FK, JWT, rate limit…). Errores de dominio recientes (Facturapi CFDI40147/40148) se traducen en helpers separados (`facturapiErrors.ts`, `formatStoredCfdiError.ts`) pero no vía `getErrorMessage`. Fragmentación aceptable dado el volumen, pero conviene documentarlo en `errorCatalog.ts`.

### OK — Handlers globales

- `AppProviders.tsx` correcto: opt-out por `meta.silent`, respeta `onError` local para evitar duplicados.
- `ErrorDetailsDialog` global montado en `AppProviders`.
- `AuthSnapshotSync` alimenta el reporte con usuario actual.

### OK — Convención de copy

`docs/audits/toasts-2026-06-23.md` documenta la convención y `feedbackMessages.ts` centraliza labels de dominio (SAT status, etc.). Sin regresiones visibles.

## 3. Recomendaciones priorizadas

1. **Ahora (HIGH):** migrar los 47 `notifyError({ message })` de validación pura → `notifyValidation`. ~10 archivos, riesgo bajo. Cambio incluye actualizar tests que asserten `notifyError` en esos flujos.
2. **Sprint próximo (MEDIUM):** enriquecer con `error:` los ~6 casos donde se pierde el objeto real.
3. **Sprint próximo (MEDIUM):** anotar los 20 `catch {}` con `// silent: razón` o convertir los sospechosos en `notifyWarning`.
4. **Backlog (LOW):** pilotar `notifyAsync` en 2–3 flujos largos.
5. **Backlog (LOW):** consolidar traducciones de dominio (CFDI, Facturapi) en `errorCatalog.ts` o dejar comentario cruzado.

## 4. Métricas a monitorear post-fix

- `rg -c "notifyError\(\s*\{\s*message:" src` debe bajar de 47 a <10 (los que sí requieren mensaje simple porque no viene error).
- 0 `toast.*` crudos en producción (mantener).
- Nuevo test: `appFeedback.test.ts` ya cubre las 6 funciones; no requiere ampliación salvo `notifyAsync` cuando se adopte.

## 5. Siguiente paso sugerido

Aprobar este plan e iniciar el **Hallazgo #1 (HIGH)** como cambio contenido en una sola versión menor, seguido de entrada en changelog. Los demás hallazgos se pueden agendar independientemente.
