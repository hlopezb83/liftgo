Sí, tiene sentido. `useBookingFormSubmit.ts` invoca `createBooking.mutate()` con un callback `onSuccess` que llama `setPostBooking()` — estado local de React. TanStack Query ejecuta el callback `onSuccess` de `mutate()` aunque el componente se haya desmontado antes de que la petición termine. Como `BookingForm` es una página (no un modal), el usuario puede navegar fuera durante la creación y provocar el warning clásico de React.

El plan es mínimo y enfocado:

1. **Crear hook reutilizable `useIsMounted`**
   - Ubicación: `src/hooks/useIsMounted.ts`
   - Implementación: `useRef(false)` + `useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [])`
   - Expone una función `() => boolean` para usar como guardia en callbacks async.

2. **Aplicar en `useBookingFormSubmit.ts`**
   - Importar `useIsMounted`.
   - Guardar la referencia en el hook.
   - En el `onSuccess` de `createBooking.mutate()`, verificar `isMounted()` antes de invocar `setPostBooking()`.
   - `toast.success()` y `navigate()` en `handleDeliveryDone` / `handlePolicyDone` no requieren guardia porque son handlers síncronos disparados por click (el componente sigue montado), pero se puede documentar en un comentario.

3. **Actualizar Changelog**
   - Nueva entrada `v6.22.8` describiendo el fix preventivo de memory leaks en formularios async.

No se extiende a otros archivos en este cambio; el patrón `useIsMounted` queda disponible para futuras aplicaciones.