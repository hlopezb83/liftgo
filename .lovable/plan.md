## Bloque 6 · Lote de cierre (v7.190.0)

Aplico los 4 pendientes reales + el nit cosmético.

### 1. Badge de moneda en historial de pagos (#1)
`src/features/invoices/hooks/invoices/usePaymentHistoryColumns.tsx` — en la celda `amount`, si `payment.currency && currency !== "MXN"` mostrar badge junto al monto (mismo estilo que el listado de facturas: `text-[10px] bg-muted px-1 rounded`).

### 2. Badge de moneda en tarjeta móvil de factura (#3)
`src/features/invoices/pages/InvoicesPage.tsx` `InvoiceCard` (~línea 105) — añadir badge condicional junto a `formatCurrency(inv.total)` cuando `inv.moneda !== "MXN"`, replicando el patrón del column def desktop.

### 3. Índice único parcial de RFC en customers (#6b)
Migración Supabase:
```sql
CREATE UNIQUE INDEX customers_rfc_unique
  ON public.customers (upper(rfc))
  WHERE rfc IS NOT NULL
    AND rfc <> ''
    AND upper(rfc) <> 'XAXX010101000'
    AND deleted_at IS NULL;
```
Excluye vacíos, el RFC genérico "Público en General" y clientes archivados. Antes de aplicar: `SELECT upper(rfc), count(*) FROM customers WHERE rfc IS NOT NULL AND rfc <> '' AND upper(rfc) <> 'XAXX010101000' AND deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1;` para confirmar que no hay duplicados que rompan la creación.

### 4. Mensajes de duplicado específicos (#12)
`src/lib/errors/index.ts` — extender la tabla de patrones con entradas específicas **antes** del catch-all genérico:
- `drivers_name_unique` → "Ya existe un operador con ese nombre."
- `forklifts_serial_number_unique` → "Ya existe un montacargas con ese número de serie."
- `equipment_models_mfr_model_unique` → "Ya existe un modelo con ese fabricante y modelo."
- `customers_rfc_unique` → "Ya existe un cliente con ese RFC."

### 5. Diálogo pre-verificación al archivar cliente (#16)
`src/features/customers/hooks/customerDetail/useCustomerDetailActions.ts` + consumers en el detalle del cliente — pasar `activeBookingsCount` al `handleDelete`. Si `> 0`, mostrar `notifyValidation({ message: "El cliente tiene N renta(s) activa(s). Cancélalas o complétalas antes de archivar." })` y **no** invocar el RPC. Cuenta ya se calcula en `useCustomerDetailPage` (`ACTIVE_BOOKING_STATUSES`).

### 6. Dashboard skeleton `gap-4 → gap-6` (#8)
`src/features/dashboard/pages/Dashboard.tsx:33` — un solo cambio de token de espaciado en el skeleton.

### Cierre
- Actualizar `public/changelog.json` (entrada v7.190.0) + `public/changelog/v7.190.0.json` + `public/version.json`.
- `bun run vitest run` para validar que nada se rompe (especialmente tests de invoices y customers).

### Fuera de scope (para ronda siguiente)
- #2 (preview extensión USD) — requiere leer `BookingExtendDialog` y confirmar impacto real.
- #10 (diálogo error SAT sin toast redundante) — requiere auditar `useStampCfdi`.
- #13 (drivers email a Zod) — refactor opcional, prioridad baja.
