# Revisión Fase 3 (v7.148.0) y siguiente fase — Bloque 5 (R4)

## Revisión de v7.148.0 (Bloque 4 parcial)

- **Bugs**: ninguno. Verifiqué `GanttRow.tsx` (button + Radix `TooltipTrigger asChild` es válido, `useNavigateTransition` = alias de `useNavigate`), `useCustomersColumns.tsx` (truncate + title) y `FormDialog.tsx` (`pb-16` compensa footer sticky de ~4rem). Typecheck y 1169 tests en verde.
- **Tests faltantes**: los 3 cambios son de presentación pura (className/onClick), sin lógica testeable adicional. No agregamos tests nuevos.
- **Pendientes de Bloque 4** (se abordan al final del R4, no ahora): 4.1 mensajes de validación (necesita repro con browser), 4.4 guarda anti-cierre en ESC (requiere hook nuevo `useDialogUnsavedGuard`).

## Alcance — Bloque 5 (Bajos)

Cinco fixes cortos y verificables extraídos de `liftgo-instrucciones-lovable-r4.md`.

### 5.1 ⌘K indexa entidades, no solo páginas
`src/layouts/GlobalSearch.tsx` hoy filtra rutas estáticas. Agregar consultas paralelas (`invoices`, `customers`, `bookings`) por número/folio/nombre, límite 5 por entidad, con navegación al detalle. Los resultados de entidades aparecen como sección separada bajo las páginas.

### 5.2 Rol "Sin rol" en vez de fallback a `dispatcher`
`src/features/users/lib/queryKeys.ts:42` (o donde esté el fallback real; confirmar antes de tocar). Cambiar el default silencioso por `null` en el hook y renderizar un `Badge variant="destructive"` con texto "Sin rol" en la tabla de usuarios. No inventar rol.

### 5.3 `$NaN` en cash-flow
Dos capas:
1. `formatCurrency` en `src/lib/money.ts` — si `Number.isNaN(value)` devolver `"—"`.
2. `billToItem` (helper de cash-flow) — coalescer `null/undefined → 0` antes de sumar.

### 5.4 invite-user borra rol residual
`supabase/functions/invite-user/index.ts` — tras el `upsert` del nuevo rol, ejecutar `DELETE FROM user_roles WHERE user_id = $1 AND role <> $2` para evitar acumulación (`customer` + rol interno).

### 5.5 `version.json` verificado en build
Añadir chequeo en el script `scripts/sync-version.mjs` (o crearlo) que compare `public/version.json` contra `public/changelog.json[0].version` y falle el build si difieren. Alternativa más simple: convertir `version.json` en un archivo generado y añadirlo a `.gitignore`.

## Testing

- Unit test para `formatCurrency(NaN)` y `formatCurrency(null)`.
- Unit test para `billToItem` con inputs nulos.
- Test Deno para la limpieza de roles en `invite-user` (mock supabase).
- 5.1 y 5.2: verificación manual documentada en changelog.

## Detalles técnicos

- Migración no requerida (Bloque 5 es puramente aplicación).
- Sin cambios de RLS ni schema.
- Changelog: `v7.149.0` (minor — múltiples fixes con nuevas capacidades en ⌘K).
- Al final: `bunx tsgo --noEmit`, `bunx vitest run`, `cd supabase/functions && deno fmt --check && deno test --allow-net --allow-env`.

## Diferido para Bloque 6

REP claim leak, trigger CRM cierre, RLS `customer_payment_intents`, `billing_secrets` write-only, regen types, `stage_order` MAX+1, `useLiftgoTable` Proxy globalFilter, `VirtualBody` cleanup. Se atacan tras aprobar Bloque 5.
