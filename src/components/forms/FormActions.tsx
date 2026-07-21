import { useFormContext } from "react-hook-form";
import { SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface FormActionsProps {
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
}

/**
 * Bloque 2.1 (v7.146.0): además de `isPending` de la mutación, consumimos
 * `formState.isSubmitting` del contexto de react-hook-form para bloquear el
 * botón mientras se resuelve la validación async (Zod). Esto previene el
 * doble submit por doble click rápido — bug reproducido en Crear Cliente.
 * Si no hay FormProvider en el árbol, useFormContext devuelve null y se
 * ignora el flag (comportamiento previo intacto).
 */
export function FormActions({ submitLabel, isPending, onCancel }: FormActionsProps) {
  const ctx = useFormContext();
  const isSubmitting = ctx?.formState?.isSubmitting ?? false;
  const busy = isPending || isSubmitting;
  return (
    <div className="flex gap-3 pt-2">
      <Button type="submit" disabled={busy}>
        {busy && <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />}
        {busy ? "Guardando…" : submitLabel}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
    </div>
  );
}
