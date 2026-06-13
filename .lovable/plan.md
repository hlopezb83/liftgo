## Fix: Test Deno `generate-invoice-pdf` devuelve 400 en lugar de 401

### Problema
El smoke test `rejects without Authorization (401)` de la Edge Function `generate-invoice-pdf` falla en CI porque devuelve `400` en vez de `401`.

Causa raíz: la función espera `invoiceId` como **query param** (`?invoiceId=...`), pero el test envía `invoice_id` en el **body POST**. Al no recibir el query param, la validación `isUUID(null)` falla primero y retorna `400` antes de llegar a la verificación de `Authorization`.

### Solución
Corregir el test para que envíe el `invoiceId` como query param en la URL, alineándolo con la interfaz real de la función.

### Cambio técnico
**Archivo:** `supabase/functions/generate-invoice-pdf/index_test.ts`

Actual (líneas 19-29):
```ts
const res = await fetch(FN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    invoice_id: "00000000-0000-0000-0000-000000000000",
  }),
});
```

Nuevo:
```ts
const res = await fetch(
  `${FN_URL}?invoiceId=00000000-0000-0000-0000-000000000000`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  },
);
```

### Verificación
Ejecutar el test filtrado de Deno para confirmar que pasa:
```bash
deno test supabase/functions/generate-invoice-pdf/index_test.ts --filter "rejects without Authorization"
```

### Impacto
- Sólo cambia un archivo de test. No se modifica la Edge Function ni ningún código de producción.
- No afecta a clientes existentes.
- Cumple con `deno fmt` (el archivo ya fue formateado previamente).