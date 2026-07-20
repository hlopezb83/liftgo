## CI en rojo — 2 errores de ESLint bloquean el pipeline

**Diagnóstico** (basado en los logs adjuntos):
- Todos los jobs pasaron excepto **ESLint** (`9_ESLint.txt` → `✖ 179 problems (2 errors, 177 warnings)` → exit 1).
- Los 2 errores son idénticos y están en el mismo archivo/línea:
  - `src/features/accounts-payable/hooks/useSupplierBillForm.ts:35:29` y `:35:47`
  - Regla: `@typescript-eslint/no-non-null-assertion`
  - Código actual: `if (hasStart && hasEnd && v.coverage_end! < v.coverage_start!)`
- Los otros ~177 son warnings preexistentes (setState-in-effect, import-x/order, etc.) — no bloquean CI.

**Nota adicional del log**: el smoke test de Deno pasó 43/43, pero **no ejecuta** los `handler_test.ts` nuevos (Sprint 1b: BL-A4) — el workflow filtra sólo `index_test.ts`. Eso NO rompió CI ahora, pero significa que las 2 pruebas BL-A4 nuevas viven fuera de CI. Lo dejo como observación; no lo incluyo en este parche para mantener el fix mínimo y desbloquear el rojo primero.

### Cambio propuesto (una sola edición)

Reemplazar los `!` por narrowing explícito extrayendo a variables locales dentro del bloque guardado:

```ts
if (hasStart && hasEnd) {
  const start = v.coverage_start as string;
  const end = v.coverage_end as string;
  if (end < start) {
    ctx.addIssue({ code: "custom", path: ["coverage_end"], message: "Fin de cobertura debe ser posterior al inicio" });
  }
}
```

Alternativa más limpia (preferida si TS lo permite sin cast) — usar early guard con `typeof`:

```ts
if (typeof v.coverage_start === "string" && typeof v.coverage_end === "string" && v.coverage_end < v.coverage_start) {
  ctx.addIssue({ code: "custom", path: ["coverage_end"], message: "Fin de cobertura debe ser posterior al inicio" });
}
```

Se elimina también el `hasStart/hasEnd !==` sólo si esa rama sigue viva; la rama de "ambas fechas requeridas" (línea 32-34) se conserva sin cambios.

### Validación

1. `bun run lint` → 0 errors (los 177 warnings quedan; no bloquean).
2. `bunx vitest run` → 1083/1083 verde (no debería tocar tests).
3. Push → CI verde.

### Changelog

`v7.114.1` (patch) — "Fix CI — eliminar non-null assertions en useSupplierBillForm".

### Fuera de alcance

- No corrijo los 177 warnings de React Compiler (`react-hooks/set-state-in-effect`, `import-x/order`, etc.) — es otro sprint dedicado.
- No agrego los `handler_test.ts` al workflow de smoke Deno — requiere decisión (¿queremos que los tests unitarios de handler vivan en un job separado más lento?). Lo puedo tomar como sprint aparte.
