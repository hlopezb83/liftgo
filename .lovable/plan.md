## Diagnóstico

Consulté la base de datos y confirmé que **FAC-0077** (y también FAC-0076) tienen `serie` y `folio` en `NULL`, aunque sí tienen `facturapi_invoice_id` y `cfdi_uuid`:

```
FAC-0077 | sent      | facturapi_invoice_id=6a4588… | serie="" | folio="" | env=live
FAC-0076 | cancelled | facturapi_invoice_id=6a4580… | serie="" | folio="" | env=live
```

Es decir, se timbraron **antes** de que v6.106.3 empezara a persistir `serie`/`folio` desde la respuesta de Facturapi. El Edge Function `backfill-facturapi-serie-folio` ya existe y es correcto, pero:

1. Solo se puede invocar por consola de navegador (fricción alta, el usuario no siempre lo recuerda).
2. Corre en **todas** las facturas afectadas a la vez y no da retroalimentación en la UI.

## Propuesta

Convertir el backfill en una acción visible desde el card de **Identificadores** cuando falte Serie/Folio en una factura ya timbrada, y ejecutarla puntualmente para esa factura.

### Cambios

1. `**supabase/functions/backfill-facturapi-serie-folio/index.ts**`
  - Aceptar body opcional `{ invoiceId?: string }`.
  - Si se envía `invoiceId`, filtrar la query solo a esa factura.
  - Mantener comportamiento actual (todas las que falten) cuando el body está vacío.
2. `**src/features/invoices/components/invoice-detail/InvoiceDetailIdentifiers.tsx**`
  - Cuando `isStamped && (!serie || !folio)` y el usuario es `admin`, mostrar un botón discreto **"Recuperar del PAC"** junto al placeholder actual.
  - Al hacer clic: `supabase.functions.invoke('backfill-facturapi-serie-folio', { body: { invoiceId } })`, mostrar toast de éxito/error, invalidar la query de la factura para que se re-renderice con los datos actualizados.
3. **Ejecutar backfill masivo una sola vez** desde el sandbox contra el proyecto para reparar FAC-0076 y FAC-0077 de inmediato (no cambia código, solo reparación de datos).
4. **Changelog** v6.106.6 (patch): "Botón admin para recuperar Serie/Folio del PAC en facturas timbradas previas a v6.106.3".

### Fuera de alcance

- No se toca `stamp-cfdi` (ya persiste correctamente desde v6.106.3).
- No se automatiza el backfill al abrir el detalle (evitar llamadas a Facturapi sin acción explícita).

## Detalles técnicos

- El botón usa `useMutation` de TanStack Query y llama a `queryClient.invalidateQueries({ queryKey: ['invoice', id] })` (o el key equivalente que use `InvoiceDetail.tsx`) al terminar.
- Solo visible cuando `hasRole('admin')` y la factura está timbrada pero sin serie/folio, así los usuarios no-admin no ven ruido.
- El Edge Function sigue exigiendo `requireAdmin`, así que la superficie de seguridad no cambia.

No hay que generar código nuevo, como solo son 2 facturas, haz el llenado manual en la BD. Las nuevas facturas ya deben de presentar la información adecuada.