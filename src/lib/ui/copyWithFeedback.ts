import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

/** Keep copied values out of diagnostic context, especially one-use links. */
export async function copyWithFeedback(
  value: string,
  label: string,
  successMessage = `${label} copiado`,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    notifySuccess(successMessage);
    return true;
  } catch (error) {
    notifyError({
      error,
      title: `No se pudo copiar ${label.toLowerCase()}`,
      description: "Selecciona el dato y cópialo manualmente.",
      severity: "warning",
      phase: "clipboard",
      method: "writeText",
    });
    return false;
  }
}
