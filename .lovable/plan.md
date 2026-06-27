## Bug
Al abrir el modal de **Nueva factura**, `useNextInvoiceNumber` llama al RPC `next_invoice_number()`, que ejecuta `nextval('invoice_number_seq')` y **consume** un folio de la secuencia. Al guardar la factura, `useCreateInvoice` vuelve a llamar `next_invoice_number()` y consume otro. Si el usuario cierra el modal sin guardar, el folio queda perdido para siempre → la siguiente vez la numeración "brinca".

## Solución
Separar **preview** (no consume) de **asignación real** (consume y es atómica), y asegurar que el folio se asigna una sola vez al guardar.

### 1. Nuevo RPC `peek_next_invoice_number()` (migración)
- Lee `last_value` + `is_called` de `public.invoice_number_seq` (vía `pg_sequences` / `pg_sequence_last_value`) y devuelve `'FAC-' || lpad(next, 4, '0')` **sin** llamar `nextval`.
- `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE` a `authenticated`.
- Marcar en el comentario que el folio es **tentativo** y puede cambiar si otro usuario guarda primero.

### 2. Frontend
- `useNextInvoiceNumber` apunta a `peek_next_invoice_number`.
- En `InvoiceForm.tsx` / componente del header del modal, mostrar el folio con etiqueta **"Folio tentativo · se asigna al guardar"** (sutil, debajo o al lado del número).
- `useCreateInvoice` sigue llamando `next_invoice_number()` (el que sí consume) en el insert — sin cambios funcionales.

### 3. Garantizar atomicidad en guardado
- Ya está: `next_invoice_number` usa `nextval` (atómico) y `invoices.invoice_number` tiene UNIQUE index. No se requiere cambio.

### 4. Tests
- Unit test del hook: mock del RPC `peek_next_invoice_number`.
- Test SQL/integración: llamar `peek_next_invoice_number()` dos veces seguidas debe devolver el **mismo** valor; después de un insert real, el peek debe avanzar en 1.

### 5. Changelog
- `v6.97.5` (patch) — "Fix: el folio de factura ya no se consume al abrir el modal de nueva factura".

## Archivos afectados
- `supabase/migrations/<timestamp>_peek_invoice_number.sql` (nuevo)
- `src/features/invoices/hooks/invoices/useNextInvoiceNumber.ts`
- `src/features/invoices/pages/InvoiceForm.tsx` (microcopy "tentativo")
- `public/changelog.json` + `public/changelog/v6.97.5.json`

## Notas
- Mismo bug aplica a **CXP- (supplier_bills)**, **NC- (credit_notes)** y **CTR- (contracts)** si abren modales que llaman a `next_*`. ¿Aplico el mismo patrón (peek) también a esos tres en este mismo cambio, o solo facturas por ahora?