## Auditoría de toasts — LiftGo

**Inventario:** 543 invocaciones en 98 archivos.
- `notifyError`: 379 · `toast.success`: 144 · `notifyWarning`: 11 · `toast.error` directo: 10 · `toast.info`: 5 · `toast.warning` directo: 4 · `toast.promise` / `toast.loading`: **0**.
- Stack: `sonner` con `<Toaster />` en `AppProviders`, position `top-center` (mobile) / `bottom-right` (desktop), border-left semántico por tipo.
- Hay handler global en `QueryCache` y `MutationCache` que llama `notifyError` salvo `meta.silent`.

Severidad: **CRITICAL** (riesgo de error de usuario o silencio total) → **HIGH** (inconsistencia visible) → **MEDIUM** (calidad/UX) → **LOW**.

---

### #1 — CRITICAL · Errores que ignoran el reporte estructurado

`toast.error(...)` directo en 6 lugares se salta `notifyError`, que es quien construye el `requestId`, el botón **Ver detalles** y la duración persistente. El usuario ve el toast 4 s y desaparece sin posibilidad de reportarlo.

Archivos:
- `src/lib/storage/openStorageFile.ts:19`
- `src/features/invoices/hooks/invoiceDetail/useStampInvoiceFlow.ts:15`
- `src/features/invoices/hooks/invoiceDetail/useDownloadInvoiceXml.ts:17`
- `src/features/bank-reconciliation/components/BankStatementUploader.tsx:27`
- `src/features/accounts-payable/hooks/useExportPaymentsForm.ts:36`
- `src/features/portal/pages/PortalStatement.tsx:48`

**Fix:** reemplazar por `notifyError({ message, description?, error? })`. Mantener `toast.error` solo dentro de `appFeedback.ts` y para flujos de **validación inline** (donde no hay error de runtime).

Excepciones legítimas que se quedan como `toast.error`:
- `useRefreshCancellationStatus` línea 19 ("Cancelación rechazada por el receptor") — es estado de negocio, no un error técnico. Mejor degradarlo a `toast.info` con icono ❌ o dejarlo.
- `ErrorDetailsDialog.tsx:27` — ironía: notificar fallo de copiar dentro del propio diálogo de error. OK como `toast.error` corto.

---

### #2 — CRITICAL · `notifyError` siempre `duration: Infinity` + `closeButton`

`appFeedback.ts:62-66` fija `duration: Infinity` para **todos** los errores. Cuando una mutación falla por algo trivial (validación de campo, "saldo cero", duplicado), el toast queda fijo hasta que el usuario lo cierre. En flujos con varios errores se acumulan y tapan UI.

**Fix:** introducir niveles:
- `notifyError({ severity: "critical" })` → `duration: Infinity` (default actual).
- `notifyError({ severity: "warning" })` → `duration: 6000`.
- Validaciones de form (sin `error`, solo `message`) → `duration: 5000`.

Auditar las 379 llamadas y degradar las que son meramente informativas (ej. "Monto inválido", "Tipo de cambio inválido", "Selecciona al menos un equipo") para que no requieran clic.

---

### #3 — HIGH · No existe `notifySuccess` (144 `toast.success` sin estilo unificado)

144 `toast.success(...)` directos sin descripción, sin opciones, sin acción (`Ver`, `Deshacer`). Pierden la oportunidad de:
- Linkear al recurso recién creado (ej. tras crear factura → botón **Ver factura**).
- Permitir **Undo** en deletes destructivos (ej. `Reserva eliminada`).
- Reporte estructurado para QA cuando se requiere telemetría.

**Fix:** crear `notifySuccess({ title, description?, action?, durationMs? })` en `appFeedback.ts`, migrar los 144 sitios (codemod simple) y empezar a agregar acciones contextuales (al menos en deletes y creaciones de entidades principales: factura, cotización, reserva, cliente).

---

### #4 — HIGH · Strings de éxito duplicados y vagos

Top duplicados: `"Eliminado"` ×3, `"Cliente actualizado"` ×3, `"Agregado"` ×3, `"Actualizado"` ×3, `"Reserva creada"` ×2, `"Pago registrado"` ×2, `"Estado actualizado"` ×2.

Vagos como `"Agregado"` o `"Actualizado"` no dicen qué se agregó/actualizó. En tablas con varias acciones por fila el usuario pierde contexto.

**Fix:** catálogo centralizado en `src/lib/domain/feedbackMessages.ts` con builders tipo `successMessages.invoiceCreated(number)` → `"Factura ${number} creada"`. Cubre i18n futura (todo está en es-MX hoy) y elimina drift.

---

### #5 — HIGH · `notifyError` swallow del mensaje real cuando se pasa `message`

`appFeedback.ts:60`: `const description = input.description ?? getErrorMessage(error)`. Bien. Pero muchas llamadas hacen `notifyError({ error: err, message: "Error al X" })` — `message` se usa como título genérico y la descripción real del error queda visible. **Correcto.** Pero hay llamadas que pasan solo `message` sin `error`, perdiendo la causa real (no hay stack, no hay `requestId`).

Ejemplos: `useRecordPaymentForm.ts:45` `notifyError({ message: "Monto inválido" })` → no es un error, es validación. Debería ser **inline form error** o `toast.warning`.

**Fix:** crear helper `notifyValidation({ field, message })` para validaciones de formulario que renderice un toast warning de 4 s, sin botón "Ver detalles" (no hay nada que ver).

---

### #6 — HIGH · `toast.success` dentro de `onSuccess` *antes* de invalidar queries

Patrón en varios mutations: `toast.success(...)`; luego `queryClient.invalidateQueries(...)`. Si la invalidación falla (RLS, network), el usuario ya vio "OK" pero la UI no se actualizó.

Ejemplo típico: `useCreditNoteMutations.ts`, `useCancelCfdi.ts`, `useRefreshCancellationStatus.ts`.

**Fix:** el patrón no es bug real (invalidate raramente falla y refetch tiene retry), pero conviene documentarlo como convención. Bajar a **MEDIUM** si se prefiere.

---

### #7 — MEDIUM · `liftgo-toast-error` y `liftgo-toast-warning` className referenced pero **sin estilos en `index.css`**

`appFeedback.ts:66` aplica `className: "liftgo-toast-error"` y `:82` `liftgo-toast-warning`. `grep` en `src/index.css` no encuentra ninguna regla con ese nombre. Son clases muertas.

**Fix:** o bien añadir reglas reales en `index.css` (ej. `bg-destructive/5`, animación de shake), o eliminar la prop.

---

### #8 — MEDIUM · `toast.info` y `toast.warning` directos sin helper

5 `toast.info` + 4 `toast.warning` directos. `notifyWarning` existe pero solo cubre `{title, description}`. No hay `notifyInfo`. Inconsistencia: a veces se usa helper, a veces no.

**Fix:** añadir `notifyInfo` y `notifyWarning` con misma firma, migrar los 9 sitios.

---

### #9 — MEDIUM · No se usan `toast.promise` ni `toast.loading`

0 ocurrencias. Operaciones largas (timbrado CFDI con Facturapi, generación de PDF, recurring invoices) no muestran progreso; el usuario ve botón disabled sin feedback. `toast.promise(promise, { loading, success, error })` resuelve esto en una sola línea.

**Fix:** introducir `notifyAsync(label, promise)` envoltorio sobre `toast.promise` y aplicarlo en: timbrado, descarga de CFDI/PDF, recurring invoices, generate-recurring-maintenance, exportar pagos, importar bancos.

---

### #10 — MEDIUM · `position` y `duration` no son responsivos

Mobile usa `top-center` (correcto, no tapa botones inferiores). Desktop `bottom-right`. Sin `expand={true}` se apilan colapsados; con muchos toasts en burst (ej. import bancario que dispara warnings por línea) el usuario solo ve el último.

**Fix:** evaluar `expand={true}` en `<Toaster>`, y/o `richColors` para que la decoración semántica sea automática.

---

### #11 — LOW · Mensajes inconsistentes para mismas acciones

- `"Reserva extendida"` vs `"Reserva extendida exitosamente"` (mismo evento, dos lugares).
- `"Usuario creado exitosamente"` vs `"Cliente creado"` (uno con sufijo, otro no).
- `"Nota de crédito timbrada"` vs `"CFDI timbrado exitosamente — UUID: …"` (con/sin detalle).

**Fix:** estilo común en docs + catálogo del #4. Regla: verbo en pasado + sustantivo, sin "exitosamente"; opcionalmente ID/folio si está disponible.

---

### #12 — LOW · `toast.info` para estados de cancelación SAT

`useRefreshCancellationStatus.ts:21` y `useCreditNoteMutations.ts:80-81` usan `toast.info(\`Estado SAT: ${status}\`)` como fallback. Si el SAT devuelve un estado inesperado el usuario ve una cadena críptica.

**Fix:** mapear `status` a label en español (ya existe el patrón para `accepted/rejected/expired/pending`).

---

## Resumen de acciones recomendadas (prioridad)

| # | Tarea | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Migrar 6 `toast.error` directos a `notifyError` | XS | Alto (reportabilidad) |
| 2 | Severity en `notifyError` + auditoría de los 379 sitios | M | Alto |
| 3 | Introducir `notifySuccess` + codemod 144 sitios | M | Alto |
| 4 | Catálogo `feedbackMessages.ts` + reemplazos | M | Medio |
| 7 | Limpiar / implementar `liftgo-toast-*` | XS | Bajo |
| 8 | Añadir `notifyInfo`, migrar 9 directos | XS | Medio |
| 9 | Introducir `notifyAsync` para operaciones largas | S | Alto |
| 11+12 | Pulir mensajes inconsistentes | S | Medio |

## Pregunta de scope

Esta auditoría es **read-only** (no se modificó código). Las siguientes son las opciones de implementación:

- **A — Quick wins (1 hr):** #1 + #7 + #8 (migración mecánica, sin riesgo).
- **B — Plataforma toast (3-4 hr):** A + #3 (`notifySuccess`) + #9 (`notifyAsync`), sin codemod masivo.
- **C — Completo (1 día):** B + #2 (severities) + #4 (catálogo centralizado) + codemod de los 144 `toast.success`.

Indica qué scope ejecutamos y emito el plan de implementación correspondiente.
