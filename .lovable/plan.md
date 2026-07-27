## Objetivo
Cerrar los 2 bloqueantes de R16 + 3 medios de bajo costo del sidebar/changelog para habilitar el GO de release. Bump a v7.236.0.

**Analogía:** el sistema es un restaurante — hoy la comanda de "renta larga" hace estallar la cocina cuando marcas el switch de recurrencia (falta el mostrador `<Form>`), y el aviso "¿tirar el pedido?" sigue apareciendo después de haber servido el plato porque el mesero mira una foto vieja de la mesa en lugar de asomarse en el momento.

## Cambios

### 1. 🔴 R16-A — `BookingForm.tsx` crashea con SwitchField sin FormProvider
- **Archivo:** `src/features/bookings/pages/BookingForm.tsx` (línea 49).
- Envolver el `<form>` existente con `<Form {...form}>` importado desde `@/components/ui/form`.
- Sin cambios de lógica. Los demás fields (`DateRangePickerField`) siguen funcionando.

### 2. 🔴 F-03 — Guard de cambios sin guardar tras `reset()+navigate()`
- **Archivo:** `src/hooks/useUnsavedChangesGuard.ts`.
- Extender firma para aceptar `boolean | (() => boolean)` (backward compatible).
- Normalizar a getter y evaluar **dentro** del callback de `useBlocker` y del `beforeunload` (via ref del getter para no re-suscribir).
- **Archivo:** `src/features/invoices/pages/InvoiceForm.tsx` (líneas 38-42).
- Pasar getter: `() => f.form.formState.isDirty && !isSubmitting && !justSavedRef.current`.
- Los otros callers (customers / inventory / suppliers dialogs) siguen pasando boolean sin cambios.

### 3. 🟡 H-1 — `useVisibleNavGroups` descarta `defaultOpen`
- **Archivo:** `src/layouts/hooks/useVisibleNavGroups.ts` (línea ~24).
- Incluir `defaultOpen: group.defaultOpen` en el map. Restaura "Ventas" abierto por defecto.

### 4. 🟡 H-3 — Sidebar colapsado desaparece completo
- **Archivo:** `src/layouts/AppSidebar.tsx` (línea 20).
- `<Sidebar collapsible="icon">` para exponer modo icono con badges + QuickCreate accesibles.

### 5. 🟡 H-2 — Punto de novedad Changelog reaparece tras recargar
- **Archivo:** `public/changelog.json` — corregir la fecha de `v7.235.0` de `2026-07-25` → `2026-07-27` para que `getCurrentVersion()` (ordena por fecha) regrese la versión real más nueva.
- **Archivo:** `public/changelog/v7.235.0.json` — misma fecha.
- (No tocar el algoritmo — el fix de datos basta y es reversible; ordenar por semver sería otra tanda.)

### 6. Changelog + versión
- Bump `package.json` y `public/changelog.json` a **v7.236.0** (patch → minor por el fix crítico R16-A que reactiva un flujo bloqueado).
- Nuevo `public/changelog/v7.236.0.json` con las 5 correcciones.
- `public/version.json` se regenera vía `scripts/gen-version.mjs` en el build.

## Fuera de alcance
- H-4 (revert visual de select de rol tras rechazo), R16-1 (combobox para el Select interno de InvoiceForm), R16-B (ya sincronizado en el build actual). Van en tanda posterior por baja severidad.

## Detalles técnicos

**Firma nueva del guard** (evaluación in-callback resuelve la carrera):
```ts
export function useUnsavedChangesGuard(isDirty: boolean | (() => boolean)) {
  const getter = typeof isDirty === "function" ? isDirty : () => isDirty;
  const getterRef = useRef(getter);
  useEffect(() => { getterRef.current = getter; });
  // beforeunload: chequea getterRef.current() en el handler
  // useBlocker: (a,b) => getterRef.current() && a.pathname !== b.pathname
}
```
`justSavedRef.current = true` + `form.reset(values)` + `navigate(...)` en el mismo tick ya son visibles cuando el blocker evalúa post-commit.

**BookingForm wrap:**
```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(...)} className="space-y-6"> ... </form>
</Form>
```

## Verificación
- `tsgo` verde tras cambios.
- Manual: `/bookings/new` con rango ≥30 días → aparece SwitchField sin crash.
- Manual: editar factura, guardar, navegar → sin diálogo "¿Descartar cambios?".
- Manual: colapsar sidebar → íconos + badges visibles; grupo "Ventas" abierto en primer load.
- Recargar `/changelog` → punto ámbar no reaparece.
