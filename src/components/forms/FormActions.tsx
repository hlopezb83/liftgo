import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface FormActionsProps {
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
}

export function FormActions({ submitLabel, isPending, onCancel }: FormActionsProps) {
  return (
    <div className="flex gap-3 pt-2">
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {isPending ? "Guardando…" : submitLabel}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Cancelar</Button>
    </div>
  );
}
