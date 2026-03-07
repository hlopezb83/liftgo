

## Eliminar Non-Null Assertions en hooks de consulta

### Cambio

En 4 hooks, reemplazar `id!` por un guard explícito que lanza un error descriptivo antes de la query. Esto estrecha el tipo a `string` sin usar `!`.

**Archivos a modificar:**

1. **`src/hooks/useInvoices.ts`** — `useInvoice`
2. **`src/hooks/useForklifts.ts`** — `useForklift`
3. **`src/hooks/useQuotes.ts`** — `useQuote`
4. **`src/hooks/useContracts.ts`** — `useContract`

**Patrón aplicado (idéntico en los 4):**

```typescript
queryFn: async () => {
  if (!id) throw new Error("ID is required");
  const { data, error } = await supabase.from("table").select("*").eq("id", id).single();
  // ...
}
```

Cada error tendrá un mensaje específico al recurso (e.g. "Invoice ID is required", "Forklift ID is required", etc.).

