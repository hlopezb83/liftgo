import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormActions } from "@/components/FormActions";
import { expenseFormSchema, type ExpenseFormData } from "@/lib/formSchemas";
import { useCreateExpense, type ExpenseCategory } from "@/features/expenses/hooks/useOperatingExpenses";
import { ExpenseFormFields } from "./ExpenseFormFields";

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExpenseFormDialog({ open, onOpenChange }: ExpenseFormDialogProps) {
  const createExpense = useCreateExpense();
  const [supplierId, setSupplierId] = useState("");

  const defaultValues: Partial<ExpenseFormData> = {
    expense_date: nowMty(),
    category: "",
    description: "",
  };

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: defaultValues as ExpenseFormData,
  });

  useEffect(() => {
    if (open) {
      setSupplierId("");
      form.reset(defaultValues as ExpenseFormData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (data: ExpenseFormData) => {
    createExpense.mutate(
      {
        category: data.category as ExpenseCategory,
        description: data.description || undefined,
        amount: data.amount,
        expense_date: format(data.expense_date, "yyyy-MM-dd"),
        is_recurring: false,
        supplier_id: supplierId || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Gasto</DialogTitle>
        </DialogHeader>

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
