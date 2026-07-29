import { createContext, useContext } from "react";

/**
 * R23-A: `FormDialog` ya intercepta Esc / click-fuera con el guard de cambios
 * sin guardar, pero el botón "Cancelar" de los consumidores llamaba
 * `onOpenChange(false)` directo y saltaba la confirmación.
 *
 * Exponemos `requestClose` por contexto para que `FormActions` (y cualquier
 * footer propio) cierre siempre por la misma puerta. Es `null` fuera de un
 * `FormDialog`, donde el `onCancel` del consumidor sigue mandando.
 */
export const FormDialogCloseContext = createContext<(() => void) | null>(null);

export function useFormDialogClose(): (() => void) | null {
  return useContext(FormDialogCloseContext);
}
