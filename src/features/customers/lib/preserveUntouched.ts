import type { CustomerFormData } from "./customerFormSchema";

/**
 * Anti-borrado en edición: un campo que el usuario NO tocó conserva su valor
 * original aunque el input haya llegado vacío (prellenado fallido/autorrelleno).
 * Borrar a propósito sigue funcionando porque ese campo queda marcado como modificado.
 */
export function preserveUntouched(
  data: CustomerFormData,
  initialData: Partial<CustomerFormData> | undefined,
  isEdit: boolean | undefined,
  dirty: Partial<Record<keyof CustomerFormData, unknown>>,
): CustomerFormData {
  if (!isEdit || !initialData) return data;
  const next = { ...data };
  (Object.keys(initialData) as (keyof CustomerFormData)[]).forEach((k) => {
    const original = initialData[k];
    if (!dirty[k] && (next[k] ?? "") === "" && original) next[k] = original;
  });
  return next;
}
