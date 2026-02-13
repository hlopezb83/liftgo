import { Button } from "@/components/ui/button";

interface FormActionsProps {
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
}

export function FormActions({ submitLabel, isPending, onCancel }: FormActionsProps) {
  return (
    <div className="flex gap-3 pt-2">
      <Button type="submit" disabled={isPending}>{submitLabel}</Button>
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
  );
}
