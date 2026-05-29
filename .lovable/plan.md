## Objetivo

Restaurar el sistema de errores con toast persistente + botón "Ver detalles" que abre `ErrorDetailsDialog` con el reporte estructurado copiable. La infraestructura (`ErrorDetailsDialog`, `errorDetailsStore`, `buildErrorReport`) sigue montada; solo falta el wrapper que conecta sonner con el store, y cablearlo globalmente para que NO vuelva a quedar huérfano.

## Causa

En v6.14.8 borré como huérfanos `src/lib/ui/appFeedback.ts` (exportaba `notifyError`/`notifyWarning`/`notifySuccess`) y `src/lib/errors/index.ts` (traducía mensajes técnicos a español). Knip los marcó porque ningún componente los importaba — la intención original era que fueran el handler global pero el cableado nunca se hizo.

## Pasos

1. **Restaurar `src/lib/errors/index.ts`** desde git con `getErrorMessage(unknown)` (traduce 23505, RLS, 23503, JWT, rate limit, etc. a frases en español).

2. **Restaurar `src/lib/ui/appFeedback.ts`** desde git con `notifyError`, `notifyWarning`, `notifySuccess`. `notifyError` crea el reporte con `buildErrorReport`, dispara `toast.error` con `duration: Infinity`, `closeButton: true` y `action: { label: "Ver detalles", onClick: () => openErrorReport(report) }`.

3. **Cablear globalmente en `src/layouts/AppProviders.tsx`** sobre el `QueryClient`:
   - `defaultOptions.mutations.onError`: si la mutación no definió su propio `onError`, llamar `notifyError({ error, phase: "mutation" })`.
   - `queryCache.onError` (vía `new QueryCache({ onError })`): mismo patrón para queries fallidas que no manejan su error.
   - Esto garantiza que TODA mutación/query con error muestre toast con detalles, y asegura un consumer real para que Knip no vuelva a marcar el archivo huérfano.

4. **Migración mínima de call sites visibles** (opcional, solo los más críticos para que el usuario perciba la mejora inmediato):
   - Reemplazar `toast.error(...)` directo en `useDeleteUser` (caso reportado: error 400 de `delete-user` en `/users`) por `notifyError({ error, title: "No se pudo eliminar usuario", method: "delete-user" })`.
   - El resto seguirá funcionando vía el handler global de TanStack Query.

5. **Verificar Knip** corre limpio (los nuevos archivos ahora tienen consumer en `AppProviders.tsx`).

6. **Changelog `6.14.9` (patch)** describiendo: restauración del sistema de detalles de error y cableado global vía QueryClient.

## Detalles técnicos

- `notifyError` retorna el `id` del toast (string | number) para permitir dismiss programático.
- `closeButton: true` y `duration: Infinity` evitan que el toast desaparezca antes de que el usuario haga clic en "Ver detalles".
- El handler global solo se dispara si la mutación no proveyó su propio `onError` (TanStack v5 sí llama el global además del local, así que se usa un flag en `meta` para opt-out cuando una mutación ya muestra su propio mensaje contextual — por defecto todas las mutaciones existentes mostrarán el toast con detalles, lo cual es el comportamiento deseado).

## Archivos tocados

- `src/lib/errors/index.ts` (restaurado)
- `src/lib/ui/appFeedback.ts` (restaurado)
- `src/layouts/AppProviders.tsx` (cablear `QueryClient` con `notifyError`)
- `src/features/users/hooks/useUserManagement.ts` (un call site representativo)
- `public/changelog.json` + `public/changelog/v6.14.9.json`

## Fuera de alcance

- Migrar TODAS las llamadas existentes `toast.error(...)` a `notifyError` (queda cubierto vía handler global; migración granular se puede hacer después módulo por módulo).
- Investigar la causa raíz del `400 Failed to delete user` — eso es un bug separado que abordaré después de que vea los detalles vía el sistema restaurado.
