## Contexto

Al timbrar el REP del pago de FAC-0091 la app mostró "REP ya está siendo timbrado o ya fue timbrado", pero en la base de datos el pago **sí era timbrable** (`rep_cfdi_status = 'none'`, sin UUID) y **no quedó ningún cambio registrado** en la bitácora ese día. Es decir: el mensaje es engañoso y la causa real quedó oculta.

Analogía: es como un torniquete que dice "ya pasaste" cuando en realidad se atoró; el letrero es siempre el mismo aunque el motivo sea otro.

## Causa

En `stamp-payment-complement`, el "candado" (claim) hace un UPDATE condicional y solo revisa si devolvió fila. Dos situaciones muy distintas terminan en el mismo 409:

1. El pago realmente ya está en `stamping`/`stamped` (caso legítimo).
2. El UPDATE **falló** (error de bloqueo/timeout/trigger) o hubo dos peticiones simultáneas — el error se manda a consola y el usuario recibe el mismo texto.

Además, si una petición reclama el pago y luego el proceso muere sin liberarlo, el pago queda atorado en `stamping` para siempre, sin forma de reintentar desde la app.

## Cambios propuestos

### 1. Distinguir las causas (edge function)

- Si el UPDATE del claim regresa error: responder 503 con el mensaje real de la base ("no se pudo iniciar el timbrado: …") en vez de "ya está siendo timbrado".
- Si el UPDATE no encontró fila: releer el pago y devolver un mensaje específico según su estado real:
  - `stamped` → "Este pago ya tiene un REP timbrado".
  - `stamping` → "El timbrado está en proceso, espera unos segundos".
  - otro caso → mensaje con el estado detectado, para no volver a quedar a ciegas.
- Agregar logs con `payment_id` y estado leído en cada rama, para que el próximo reporte sea diagnosticable de inmediato.

### 2. Recuperación de claims atorados

- Registrar la hora de inicio del claim y permitir reclamar de nuevo un pago que lleve más de 5 minutos en `stamping` (equivale a "el torniquete se destraba solo"). Se implementa con una columna nueva de timestamp en `payments` y su condición en el claim, más el GRANT correspondiente.

### 3. Evitar dobles disparos desde la UI

- En el alta de pago (`useRecordPaymentForm`) el REP se timbra automáticamente y además existe el botón manual "Timbrar REP" en el historial: se deshabilitará el botón manual mientras el pago esté en `stamping` o mientras haya un timbrado en curso para ese mismo pago (hoy solo se bloquea de forma global por `isPending`).

### 4. Validación

- Reintentar el timbrado del pago de FAC-0091 en preview y revisar los logs de la función.
- Pruebas unitarias del nuevo mapeo de estados a mensajes.
- Entrada de changelog v7.248.1 (`public/changelog.json` + `public/changelog/v7.248.1.json`).

## Detalles técnicos

- Archivos: `supabase/functions/stamp-payment-complement/index.ts`, `src/features/invoices/hooks/invoices/usePaymentHistoryColumns.tsx`, migración para `payments.rep_stamping_started_at`.
- El claim sigue siendo atómico (un solo UPDATE condicional); solo se amplía la condición con el vencimiento del claim y se mejora el reporte de error.
- No se toca la lógica de Facturapi ni el cálculo de parcialidad (`prepare_payment_complement`).
