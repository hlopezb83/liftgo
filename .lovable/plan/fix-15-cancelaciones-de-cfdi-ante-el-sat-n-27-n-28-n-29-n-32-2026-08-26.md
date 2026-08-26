# fix-15: cancelaciones de CFDI ante el SAT (N-27, N-28, N-29, N-32, N-49)

Validé los 5 hallazgos contra el código y la base de datos: los cinco son bugs reales. Ninguno es cosmético; todos pueden dejar el SAT y nuestra base de datos contando cosas distintas.

## Qué está mal hoy

- **N-49 / N-27 (REP, complemento de pago).** Al cancelar un REP, si el SAT deja la cancelación "pendiente" (el cliente tiene 72 horas para aceptar), no guardamos nada: el pago sigue marcado como "timbrado" y no existe forma de volver a consultar el estado. Además, dos clics seguidos mandan dos cancelaciones al SAT porque no hay candado. La tabla `payments` hoy no tiene ninguna columna de estado de cancelación (verificado: solo `rep_cfdi_status`, `rep_cancelled_at`, etc.).
- **N-28 (notas de crédito).** `cancel-credit-note` tampoco tiene candado: dos peticiones simultáneas mandan dos cancelaciones al PAC. La columna `credit_notes.cancellation_status` ya existe, solo no se usa como candado.
- **N-29 (reconciliación de timbrado).** Si dos corridas del cron se traslapan, ambas procesan la misma factura y le queman dos intentos de timbrado en el mismo ciclo, agotando el presupuesto antes de tiempo.
- **N-32 (REP de proveedor).** Se puede sobrescribir un REP ya validado y no hay índice único que impida registrar el mismo UUID en dos pagos distintos (hoy no hay duplicados en datos: buen momento para poner el candado).

## Qué haremos

1. **Base de datos**
   - `payments`: agregar `rep_cancellation_status` (con valores válidos: none/pending/accepted/rejected/expired), `rep_cancellation_motive`, `rep_substitution_uuid` y `rep_cancellation_reason`. El diff original solo agregaba la primera, pero el código de N-49 escribe las cuatro.
   - `supplier_payments`: índice único parcial sobre `rep_cfdi_uuid`.
   - Ambas migraciones respetan las reglas permanentes (sin tablas nuevas, sin cambios de RLS; los `GRANT` existentes se conservan).

2. **`cancel-payment-complement` (N-49)**: candado atómico antes de llamar al PAC — un solo UPDATE condicionado marca `pending` y guarda motivo/sustitución/razón; peticiones concurrentes reciben 409. Si no hay referencia al PAC, se libera el candado. Cuando el SAT acepta, se marca cancelado como hoy.

3. **`refresh-cancellation-status` (N-27)**: aceptar también `payment_id` para consultar y persistir el estado de cancelación del REP; solo baja a "cancelado" cuando el SAT confirma. Se agrega el hook de front `useRefreshRepCancellationStatus` y el botón de "Consultar estado SAT" donde ya se muestra el REP.

4. **`cancel-credit-note` (N-28)**: mismo candado atómico `none → pending`, con liberación cuando la cancelación nunca llegó al PAC.

5. **`reconcile-stamping-invoices` (N-29)**: claim por fila condicionado a `updated_at`, y los incrementos de `stamping_attempts` condicionados al contador leído; las filas perdidas en la carrera se reportan como omitidas en vez de duplicar el consumo.

6. **`validate-supplier-rep` (N-32)**: rechazar con 409 si el pago ya tiene REP validado salvo `force: true`, y traducir el error 23505 del índice único a un 409 claro.

## Detalles técnicos

- Migraciones nuevas en `supabase/migrations/` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `CREATE UNIQUE INDEX ... WHERE rep_cfdi_uuid IS NOT NULL`). Sin tocar RLS ni funciones `SECURITY DEFINER`.
- Prueba de humo SQL nueva: `supabase/tests/r_fix15_cancelaciones_smoke.sql` (existencia de columnas, del índice único y del check de estados).
- Pruebas Deno para los nuevos caminos 409 en `cancel-payment-complement`, `cancel-credit-note` y `validate-supplier-rep`; prueba Vitest para el hook de refresh del REP.
- Se corren `deno fmt`, la suite Vitest completa y `bun run lint`.
- Changelog: nueva entrada **v7.347.0** en `public/changelog.json`, `public/changelog/v7.347.0.json`, `CHANGELOG.md` y `package.json`.

## Nota

No se hace backfill: los REP ya cancelados quedan como están; el `rep_cancellation_status` arranca en "none" para todos y se llena a partir de la próxima cancelación o consulta.
