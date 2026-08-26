# fix-19: validación y plan (N-43, N-46, N-47, N-48)

Revisé los cuatro hallazgos contra el código y la base de datos actuales. **Los cuatro son reales**, pero dos necesitan ajustes respecto al diff propuesto.

## Resumen de validación

| ID | ¿Real? | Nota |
|----|--------|------|
| N-43 | Sí | `toggle-user-status` devuelve al cliente el mensaje crudo de BD/auth (fuga de detalle interno). El resto de las funciones ya usa mensaje genérico + log. |
| N-46 | Sí, con ajuste | Reclasificar pisa la revisión humana y gasta créditos. El diff propone respetar `module` cuando es `null`/vacío, pero en la BD `module` es NOT NULL con default `'Sin clasificar'`: nunca sería null, así que el override manual sí se pisaría. Hay que tratar `'Sin clasificar'` como "sin valor". |
| N-47 | Sí, con ajuste | `feedback_reports` no tiene límites de longitud en `title`/`description`, y `reporter_type` lo manda el cliente (un cliente del portal podría marcarse como `internal`). Los datos existentes cumplen los rangos propuestos, así que los CHECK entran sin backfill. |
| N-48 | Sí | `customer_payment_intents` solo valida `amount > 0`; un cliente del portal puede reportar un pago mayor al saldo. La tabla está vacía hoy, sin riesgo de romper histórico. |

## Qué se va a implementar

### N-43 — No filtrar errores crudos (toggle-user-status)
Sustituir `profileErr.message` y `authErr.message` por un mensaje genérico en español y registrar el detalle con `console.error`. Se conserva la compensación que revierte `profiles.is_active` cuando falla el ban.

### N-46 — Clasificación AI idempotente y respetuosa del override humano
- `BodySchema` acepta `force?: boolean` (default `false`).
- Si `context_json.ai_classification` ya existe y `force !== true`, responder 409 con la clasificación previa, antes de llamar al modelo (no se gastan créditos).
- Al guardar: escribir `severity` solo si sigue en `null`, y `module` solo si es `'Sin clasificar'` o vacío. `context_json.ai_classification` siempre se actualiza.
- Eliminar el ternario muerto (`report.type === "bug" ? x : x`).
- Frontend: `useClassifyFeedback` acepta `{ reportId, force }` y `FeedbackDetailSheet` ofrece reclasificar (confirmación) cuando ya hay clasificación previa, manejando el 409 con un mensaje claro.

### N-47 — Integridad de feedback_reports (migración)
- CHECK de longitud: `title` 3–300, `description` 10–5000 (sobre el texto sin espacios).
- Trigger `BEFORE INSERT` que deriva `reporter_type` del rol real (`customer` en `user_roles` → `'customer'`, cualquier otro → `'internal'`), ignorando lo que mande el cliente. Función `SECURITY DEFINER` con `SET search_path = public` y `REVOKE ALL ... FROM PUBLIC`.

### N-48 — Validar monto de reportes de pago del portal (migración)
Trigger `BEFORE INSERT` en `customer_payment_intents` que rechaza montos ≤ 0 y montos mayores al saldo disponible de la factura, calculado igual que `v_invoices_with_balance` (total − pagos − notas de crédito timbradas vigentes) menos otros intents en `pending_review` de la misma factura. Mensaje de error en español, mapeado al catálogo de errores del cliente si aplica.

## Detalles técnicos

- Migraciones nuevas siguiendo las reglas permanentes: `SECURITY DEFINER` + `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC` en las funciones de trigger, sin policies `USING (true)`.
- Se añade una suite de humo SQL (`supabase/tests/r_fix19_smoke.sql`) que cubre: rechazo de `reporter_type` falsificado, CHECK de longitudes, y monto de intent por encima del saldo.
- Tests unitarios Deno para el 409 de reclasificación y para el mensaje genérico de `toggle-user-status`.
- Se ejecutan `lint`, tipos, build y la suite completa de Vitest antes de cerrar.
- Changelog: nueva entrada **v7.350.0** (minor: reglas de negocio nuevas en BD + cambios de contrato en una función) en `public/changelog.json`, `public/changelog/v7.350.0.json`, `CHANGELOG.md` y `public/version.json`/`package.json`.
