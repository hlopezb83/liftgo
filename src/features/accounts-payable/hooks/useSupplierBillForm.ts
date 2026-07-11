import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { z } from "zod";
import { useSuppliers } from "@/features/suppliers";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";
import { useCreateSupplierBill, useUpdateSupplierBill } from "./useSupplierBillMutations";
import type { ExpenseCategory } from "../lib/supplierBillConstants";
import type { SupplierBillDetail } from "./useSupplierBill";

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

function parseYMD(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function billToFormDefaults(bill: SupplierBillDetail): SupplierBillFormData {
  return {
    supplier_id: bill.supplier_id ?? "",
    category: bill.category ?? "",
    description: bill.description ?? "",
    issue_date: parseYMD(bill.issue_date) ?? nowMty(),
    due_date: parseYMD(bill.due_date),
    currency: (bill.currency === "USD" ? "USD" : "MXN"),
    exchange_rate: Number(bill.exchange_rate ?? 1),
    subtotal: Number(bill.subtotal),
    tax_amount: Number(bill.tax_amount),
    retention_iva: Number(bill.retention_iva),
    retention_isr: Number(bill.retention_isr),
    cfdi_uuid: bill.cfdi_uuid ?? "",
    payment_method_sat:
      bill.payment_method_sat === "PUE" || bill.payment_method_sat === "PPD"
        ? bill.payment_method_sat
        : undefined,
  };
}

export interface SupplierBillFormOverrides {
  initialValues?: Partial<SupplierBillFormData>;
  cfdiXmlUrl?: string | null;
}

export function useSupplierBillForm(
  open: boolean,
  onClose: () => void,
  initialBill?: SupplierBillDetail | null,
  overrides?: SupplierBillFormOverrides,
) {
  const create = useCreateSupplierBill();
  const update = useUpdateSupplierBill();
  const isEdit = !!initialBill;

  const emptyDefaults: SupplierBillFormData = {
    supplier_id: "", category: "", description: "",
    issue_date: nowMty(), currency: "MXN", exchange_rate: 1,
    subtotal: 0, tax_amount: 0, retention_iva: 0, retention_isr: 0,
    cfdi_uuid: "",
  };

  const buildDefaults = (): SupplierBillFormData => {
    if (initialBill) return billToFormDefaults(initialBill);
    return { ...emptyDefaults, ...(overrides?.initialValues ?? {}) };
  };

  const form = useForm<SupplierBillFormData>({
    resolver: zodResolver(supplierBillFormSchema),
    defaultValues: buildDefaults(),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(buildDefaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBill?.id]);

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
    if (suggestedDueDate && !dueDate && !isEdit) {
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
    const basePayload = {
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
    };
    const payload =
      overrides?.cfdiXmlUrl !== undefined
        ? { ...basePayload, cfdi_xml_url: overrides.cfdiXmlUrl }
        : basePayload;

    if (isEdit && initialBill) {
      update.mutate(
        { id: initialBill.id, patch: payload },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return {
    form, selectedSupplier, suggestedDueDate, total,
    isEdit,
    isPending: create.isPending || update.isPending,
    onSubmit: form.handleSubmit(onSubmit),
  };
}
