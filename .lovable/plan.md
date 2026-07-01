## Fix `deno fmt` en `generate-recurring-invoices/index.ts`

El CI corre `deno fmt --check` y detecta que `supabase/functions/generate-recurring-invoices/index.ts` no está formateado según las reglas de Deno (líneas largas que deben partirse). Son puramente cambios de whitespace/wrapping — no hay cambios de lógica.

### Cambio único

Aplicar el formato que `deno fmt` propone en el diff del error, en las 8 secciones señaladas (líneas ~178, 240, 257, 262, 293, 311, 359, 413). Equivalente a correr localmente:

```bash
cd supabase/functions && deno fmt generate-recurring-invoices/index.ts
```

### Verificación

- `cd supabase/functions && deno fmt --check` pasa sin errores.
- Tests existentes de la función siguen pasando (`generate-recurring-invoices/index_test.ts`) — no hay cambios de comportamiento.
- Bump patch en changelog: v6.103.2 con nota "chore: aplicar formato deno fmt en generate-recurring-invoices".
