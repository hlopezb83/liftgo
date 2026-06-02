import { useState } from "react";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { nowMty, parseDateLocal } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { FormActions } from "@/components/FormActions";
import { expenseFormSchema, type ExpenseFormData } from "@/features/expenses/lib/expenseFormSchema";
import { useCreateExpense, type ExpenseCategory } from "@/features/expenses/hooks/useOperatingExpenses";
import { ExpenseFormFields } from "./ExpenseFormFields";
import type { CfdiPrefill } from "@/features/expenses/lib/cfdiPrefill";

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: CfdiPrefill | null;
}

export function ExpenseFormDialog({ open, onOpenChange, prefill }: ExpenseFormDialogProps) {
  const createExpense = useCreateExpense();
  const [supplierId, setSupplierId] = useState("");

  const buildDefaults = (): Partial<ExpenseFormData> => {
    if (prefill) {
      return {
        expense_date: prefill.fecha ? parseDateLocal(prefill.fecha) : nowMty(),
        amount: prefill.total,
        category: prefill.categoria_sugerida,
        description: prefill.description,
      };
    }
    return { expense_date: nowMty(), category: "", description: "" };
  };

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: buildDefaults() as ExpenseFormData,
  });

  usePrefillEffect(() => {
    if (open) {
      setSupplierId(prefill?.supplier_match?.id ?? "");
      form.reset(buildDefaults() as ExpenseFormData);
    }
  }, [open, prefill]);

  const onSubmit = (data: ExpenseFormData) => {
    createExpense.mutate(
      {
        category: data.category as ExpenseCategory,
        description: data.description || undefined,
        amount: data.amount,
        expense_date: format(data.expense_date, "yyyy-MM-dd"),
        is_recurring: false,
        supplier_id: supplierId || null,
        cfdi_uuid: prefill?.cfdi_uuid ?? null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prefill ? "Registrar Gasto desde CFDI" : "Registrar Gasto"}</DialogTitle>
        </DialogHeader>

        {prefill && (
          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <FileText className="h-3.5 w-3.5" />
              Pre-llenado desde CFDI
              <Badge variant="outline" className="font-mono text-[10px]">
                {prefill.cfdi_uuid.slice(0, 8)}…
              </Badge>
            </div>
            <p className="text-muted-foreground">
              <span className="font-medium">{prefill.emisor.nombre}</span>
              {prefill.emisor.rfc && <> · {prefill.emisor.rfc}</>}
            </p>
            {!prefill.supplier_match && prefill.emisor.rfc && (
              <p className="text-amber-600 dark:text-amber-500">
                ⚠ Proveedor no existe en el sistema. Puedes crearlo después desde Proveedores.
              </p>
            )}
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ExpenseFormFields form={form} supplierId={supplierId} setSupplierId={setSupplierId} />
          <DialogFooter>
            <FormActions
              submitLabel="Registrar"
              isPending={createExpense.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
