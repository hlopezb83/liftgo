## Fix CI — ESLint error

Un solo job en rojo (ESLint). Todos los demás jobs pasaron (804 tests, 33 RLS, 43 Deno, Playwright shards, Typecheck, Build, Knip, Secrets).

### Error
```
src/features/invoices/hooks/invoices/usePaymentHistoryColumns.tsx
  129:6  error  React Hook useMemo has a missing dependency: 'confirm'
```

El `useMemo` que arma las columnas usa `confirm` (de `useConfirm()`) dentro del handler de "Cancelar REP", pero no lo declara en el array de dependencias.

### Cambio
Agregar `confirm` al array de dependencias del `useMemo` en la línea 129:

```ts
}, [ppdStamped, allowRepMutations, stampRep, cancelRep, confirm]);
```

### Verificación
- `bun run lint` limpio en el archivo.
- Sin cambios de comportamiento (`confirm` de `useConfirm` es estable).
- Registrar changelog `v7.4.2` (patch).