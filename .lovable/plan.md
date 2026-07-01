## Contexto

Verifiqué el estado actual en la base:

- `FAC-0073` → no existe (hueco en la numeración)
- `FAC-0074` → existe (draft, 27/jun)
- `FAC-0075` → existe (draft, 30/jun, id `ffee4a4b…`, la que estás viendo)

Como `FAC-0073` está libre, el renombrado es seguro respecto al UNIQUE index de `invoice_number`.

## Cambio a ejecutar

Un solo UPDATE en `public.invoices`:

```sql
UPDATE public.invoices
SET invoice_number = 'FAC-0073',
    updated_at = now()
WHERE id = 'ffee4a4b-c987-4020-b27c-c36c86b06788'
  AND invoice_number = 'FAC-0075';
```

## Consideraciones

- **Solo cambia el folio visible**, no toca CFDI (la factura está en `draft`, no timbrada, así que no hay UUID SAT que preservar).
- **Queda hueco en FAC-0075**: la próxima factura nueva tomará FAC-0076 desde `invoice_number_seq` (que ya está en 75). Si quieres que la siguiente sea FAC-0075 y cerrar el hueco, avísame y agrego un `setval('invoice_number_seq', 74, true)` al mismo cambio.
- **Auditoría**: el trigger de audit_logs registrará el cambio automáticamente.
- No hay changelog entry porque es un ajuste puntual de datos, no de código.

## Confirmación que necesito

¿Ejecuto solo el rename, o también reseteo la secuencia a 74 para que la próxima factura sea FAC-0075 y no quede hueco?
