import { toast } from "sonner";

/**
 * Wrapper delgado de sonner para acciones simples del CRM (creación, edición,
 * borrado optimista con undo). Para errores reales usa `notifyError` desde
 * `@/lib/ui/appFeedback` para tener reporte estructurado.
 */
export const crmToast = {
  success: (title: string, description?: string) => toast.success(title, { description }),
  error: (title: string, description?: string) => toast.error(title, { description }),
  info: (title: string, description?: string) => toast(title, { description }),
  undo: (title: string, onUndo: () => void, description?: string) =>
    toast(title, {
      description,
      action: { label: "Deshacer", onClick: onUndo },
    }),
};
