# fix-32.diff — Portal de pagos, conciliación y storage (R6-04/05/09/10/14/15/24)

Validé el parche contra la base de datos real. Los 7 hallazgos son bugs reales; el parche es correcto salvo un punto que no puede aplicarse como viene (creación del bucket por SQL).

## Hallazgos confirmados

- **R6-04 (alto) — `approve_payment_intent`**: hoy suma `payments.amount` en crudo (sin conversión de moneda), no bloquea la factura (`FOR UPDATE` ausente → dos aprobaciones simultáneas pueden sobrepagar), no descuenta intents pendientes, el criterio de notas de crédito omite `status <> 'cancelled'`, y graba el pago con `exchange_rate` = tipo de cambio de la factura aunque el intent no declare moneda.
- **R6-09 (alto) — `validate_payment_intent_amount`**: mismo problema de suma sin conversión; en facturas en USD un cliente puede reportar montos inválidos.
- **R6-10 (medio) — conciliación bancaria**: `confirm_bank_match` y `get_bank_match_candidates` sólo usan `payments.exchange_rate`; si el pago no trae TC propio pero la factura sí (`invoices.tipo_cambio`), el candidato desaparece o el match se rechaza.
- **R6-15 (medio)**: la policy de INSERT de `customer_payment_intents` permite reportar pagos sobre facturas canceladas o borrador, y no valida que la carpeta del comprobante corresponda a la factura.
- **R6-14 (medio)**: la policy DELETE de `storage.objects` deja a admin/administrativo borrar comprobantes de intents ya aprobados/rechazados (pérdida de evidencia).
- **R6-24 (bajo)**: la policy de subida usa `COALESCE(mimetype,'application/pdf')`, es decir, un archivo sin mimetype declarado pasa la whitelist.
- **R6-05 (bajo)**: verifiqué el bucket `payment-proofs`: existe y es privado, pero **sin** `allowed_mime_types` ni `file_size_limit`, así que el enforcement real de tipo/tamaño no existe.

## Qué se va a implementar

1. **Migración SQL** con las funciones y policies del parche:
   - `approve_payment_intent`: `SELECT ... FOR UPDATE` de la factura, conversión FX con el mismo `CASE` que `sync_invoice_status_from_payments`, descuento de intents `pending_review`, criterio canónico de NC, e inserción del pago en la moneda de la factura con `exchange_rate = NULL`.
   - `validate_payment_intent_amount`: lectura de `moneda`/`tipo_cambio` y suma de pagos con conversión FX.
   - `confirm_bank_match` y `get_bank_match_candidates`: `LEFT JOIN invoices` y fallback `COALESCE(NULLIF(p.exchange_rate,0), NULLIF(i.tipo_cambio,0))`.
   - Policy INSERT de `customer_payment_intents`: excluye facturas `cancelled`/`draft` y con cancelación aceptada, y exige que el segmento 2 de `proof_url` sea el `invoice_id` (formato que ya usa `useCreatePaymentIntent.ts`).
   - Policies de storage: DELETE con el `NOT EXISTS` fuera del OR de roles; INSERT sin el `COALESCE` permisivo de mimetype.
2. **Bucket `payment-proofs`** (desvío respecto al parche): el `INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING` del diff **no haría nada** porque el bucket ya existe, y además la plataforma rechaza SQL sobre `storage.buckets`. Se configurará con la herramienta de storage: privado, límite 10 MB y whitelist `application/pdf, image/png, image/jpeg, image/webp`.
3. **Pruebas SQL** en `supabase/tests/` (smoke): aprobación de intent en factura USD con pago en MXN, rechazo por sobrepago con intent pendiente, y match bancario usando el TC de la factura.
4. **Changelog**: nueva entrada **v7.367.0** (minor) en `CHANGELOG.md` y al inicio de `public/changelog.json`.

## Notas técnicas

- Las policies usan `(select auth.uid())` y las funciones `SECURITY DEFINER` mantienen `SET search_path = public` y guards de rol, conforme a las reglas permanentes de migraciones.
- `customer_payment_intents` no tiene columna `currency`; se asume (como el parche) que el monto reportado está en la moneda de la factura. En `validate_payment_intent_amount` se simplificará el `CASE` de intents a la suma directa, ya que las ramas con `NULL::text` del parche son código muerto equivalente.
- Efecto secundario esperado de R6-14: admin/administrativo ya no podrán borrar comprobantes de intents aprobados o rechazados; es intencional (retención de evidencia).
- Se verificará con `bun test` y el linter de migraciones.
