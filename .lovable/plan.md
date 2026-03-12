

## Sincronizar costo de venta al editar costo de adquisición

### Cambio en `src/hooks/useForklifts.ts` — `useUpdateForklift`

En el `mutationFn`, después de actualizar el forklift, verificar si:
1. El campo `acquisition_cost` fue modificado (`updates.acquisition_cost` está presente)
2. El forklift tiene status `sold`

Si ambas condiciones se cumplen, buscar en `operating_expenses` el registro con `category = 'costo_venta'` y `description LIKE '%{forklift.name}%'` y actualizarlo con el nuevo monto.

```typescript
// Después del update exitoso:
if (updates.acquisition_cost !== undefined && data.status === "sold") {
  const { data: expenses } = await supabase
    .from("operating_expenses")
    .select("id")
    .eq("category", "costo_venta")
    .ilike("description", `%${data.name}%`);
  
  if (expenses && expenses.length > 0) {
    await supabase
      .from("operating_expenses")
      .update({ amount: Number(updates.acquisition_cost) })
      .eq("id", expenses[0].id);
  }
}
```

Agregar invalidación de `operating_expenses` en `onSuccess`.

### Changelog
Registrar v3.38.3 en `src/lib/changelog.ts`.

### Archivos
- `src/hooks/useForklifts.ts`
- `src/lib/changelog.ts`

