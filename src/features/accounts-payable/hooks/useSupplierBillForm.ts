import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSuppliers } from "@/features/suppliers";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";
import { useCreateSupplierBill } from "./useSupplierBillMutations";
import type { ExpenseCategory } from "../lib/supplierBillConstants";

export const supplierBillFormSchema = z.object({
  supplier_id: z.string().min(1, "Selecciona un proveedor"),
  category: z.string().min(1, "Selecciona una categoría"),
  description: z.string().default(""),
  issue_date: z.date({ required_error: "Fecha de emisión requerida" }),
  due_date: z.date().optional(),
  currency: z.enum(["MXN", "USD"]),
  exchange_rate: z.coerce.number().positive().default(1),
  subtotal: z.coerce.number().nonnegative("Subtotal inválido"),
  tax_amount: z.coerce.number().nonnegative().default(0),
  retention_iva: z.coerce.number().nonnegative().default(0),
  retention_isr: z.coerce.number().nonnegative().default(0),
  cfdi_uuid: z.string().default(""),
  payment_method_sat: z.enum(["PUE", "PPD"]).optional(),
});

export type SupplierBillFormData = z.infer<typeof supplierBillFormSchema>;

export function useSupplierBillForm(open: boolean, onClose: () => void) {
  const create = useCreateSupplierBill();

  const form = useForm<SupplierBillFormData>({
    resolver: zodResolver(supplierBillFormSchema),
    defaultValues: {
      supplier_id: "", category: "", description: "",
      issue_date: nowMty(), currency: "MXN", exchange_rate: 1,
      subtotal: 0, tax_amount: 0, retention_iva: 0, retention_isr: 0,
      cfdi_uuid: "",
    },
  });

  useEffect(() => {
    if (open) form.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: suppliersList } = useSuppliers();
  const supplierId = form.watch("supplier_id");
  const issueDate = form.watch("issue_date");
  const dueDate = form.watch("due_date");

  const selectedSupplier = useMemo(
    () => suppliersList?.find((s) => s.id === supplierId),
    [suppliersList, supplierId],
  );
  const suggestedDueDate = useMemo(() => {
    const days = selectedSupplier?.default_payment_terms_days;
    if (!days || !issueDate) return null;
    const d = new Date(issueDate);
    d.setDate(d.getDate() + days);
    return d;
  }, [selectedSupplier, issueDate]);

  useEffect(() => {
    if (suggestedDueDate && !dueDate) {
      form.setValue("due_date", suggestedDueDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, issueDate]);

  const subtotal = Number(form.watch("subtotal") || 0);
  const tax = Number(form.watch("tax_amount") || 0);
  const retIva = Number(form.watch("retention_iva") || 0);
  const retIsr = Number(form.watch("retention_isr") || 0);
  const total = subtotal + tax - retIva - retIsr;

  const onSubmit = (data: SupplierBillFormData) => {
    create.mutate(
      {
        supplier_id: data.supplier_id,
        category: data.category as ExpenseCategory,
        description: data.description || null,
        issue_date: toYMD(data.issue_date) ?? "",
        due_date: toYMD(data.due_date) ?? null,
        currency: data.currency,
        exchange_rate: data.exchange_rate,
        subtotal: data.subtotal,
        tax_amount: data.tax_amount,
        retention_iva: data.retention_iva,
        retention_isr: data.retention_isr,
        total,
        cfdi_uuid: data.cfdi_uuid || null,
        payment_method_sat: data.payment_method_sat ?? null,
      },
      { onSuccess: onClose },
    );
  };

  return {
    form, selectedSupplier, suggestedDueDate, total,
    isPending: create.isPending,
    onSubmit: form.handleSubmit(onSubmit),
  };
}
