import { useState } from "react";

/**
 * Conserva la primera versión cargada para el registro que se está editando.
 * Un refetch no renueva el candado optimista. Cambiar de registro lo reinicia
 * antes de renderizar los hijos, sin efectos ni lecturas de refs en render.
 */
export function useInitialRecordVersion<T extends string | number>(
  recordId: string | undefined,
  loadedRecordId: string | undefined,
  version: T | null | undefined,
): T | null {
  const currentValue = recordId && loadedRecordId === recordId ? version ?? null : null;
  const [snapshot, setSnapshot] = useState(() => ({ recordId, value: currentValue }));

  if (snapshot.recordId !== recordId) {
    setSnapshot({ recordId, value: currentValue });
    return currentValue;
  }
  if (snapshot.value === null && currentValue !== null) {
    setSnapshot({ recordId, value: currentValue });
    return currentValue;
  }
  return snapshot.value;
}
