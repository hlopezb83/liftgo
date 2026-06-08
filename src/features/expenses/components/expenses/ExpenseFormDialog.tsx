import { useState, useCallback } from "react";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";
import { format } from "date-fns";
import { nowMty, parseDateLocal } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { FormActions } from "@/components/FormActions";
import { expenseFormSchema, type ExpenseFormData } from "@/features/expenses/lib/expenseFormSchema";
import { useCreateExpense, type ExpenseCategory, type OperatingExpense } from "@/features/expenses/hooks/useOperatingExpenses";
import { ExpenseFormFields } from "./ExpenseFormFields";
import { useLinkRfcToSupplier } from "@/features/suppliers/hooks/useLinkRfcToSupplier";
import type { CfdiParseResult, CfdiPrefill } from "@/features/expenses/lib/cfdiPrefill";

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (expense: OperatingExpense) => void;
}

export function ExpenseFormDialog({ open, onOpenChange, onCreated }: ExpenseFormDialogProps) {
  const createExpense = useCreateExpense();
  const linkRfc = useLinkRfcToSupplier();
  const [supplierId, setSupplierId] = useState("");
  const [prefill, setPrefill] = useState<CfdiPrefill | null>(null);
  const [cfdiLoading, setCfdiLoading] = useState(false);
  const [rfcLinked, setRfcLinked] = useState(false);

  const buildDefaults = (p: CfdiPrefill | null): Partial<ExpenseFormData> => {
    if (p) {
      return {
        expense_date: p.fecha ? parseDateLocal(p.fecha) : nowMty(),
        amount: p.total,
        category: p.categoria_sugerida,
        description: p.description,
      };
    }
    return { expense_date: nowMty(), category: "", description: "" };
  };

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: buildDefaults(null) as ExpenseFormData,
  });

  usePrefillEffect(() => {
    if (open) {
      setPrefill(null);
      setSupplierId("");
      setRfcLinked(false);
      form.reset(buildDefaults(null) as ExpenseFormData);
    }
  }, [open]);

  const handleCfdiFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xml")) {
      notifyError({ message: "El archivo debe ser un XML del CFDI" });
      return;
    }
    if (file.size > 1024 * 1024) {
      notifyError({ message: "El XML excede 1MB" });
      return;
    }
    setCfdiLoading(true);
    try {
      const xml = await file.text();
      const { data, error } = await supabase.functions.invoke<CfdiParseResult>(
        "parse-cfdi-expense",
        { body: { xml } },
      );
      if (error) throw error;
      if (!data) throw new Error("Respuesta vacía");
      if (data.duplicate === true) {
        toast.warning("Este CFDI ya fue registrado anteriormente");
        return;
      }
      const { duplicate: _d, ...p } = data;
      setPrefill(p);
      setSupplierId(p.supplier_match?.id ?? "");
      setRfcLinked(false);
      form.reset(buildDefaults(p) as ExpenseFormData);
      toast.success("CFDI cargado correctamente");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "No se pudo procesar el CFDI";
      notifyError({ message: msg });
    } finally {
      setCfdiLoading(false);
    }
  }, [form]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "text/xml": [".xml"], "application/xml": [".xml"] },
    multiple: false,
    disabled: cfdiLoading,
    onDrop: (files) => { if (files[0]) void handleCfdiFile(files[0]); },
  });

  const clearCfdi = () => {
    setPrefill(null);
    setSupplierId("");
    setRfcLinked(false);
    form.reset(buildDefaults(null) as ExpenseFormData);
  };

  const onSubmit = (data: ExpenseFormData) => {
    createExpense.mutate(
      {
        category: data.category as ExpenseCategory,
        description: data.description || undefined,
        amount: data.amount,
        expense_date: format(data.expense_date, "yyyy-MM-dd"),
        supplier_id: supplierId || null,
        cfdi_uuid: prefill?.cfdi_uuid ?? null,
      },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          onCreated?.(created);
        },
      },
    );
  };

  const onInvalid = () => {
    notifyError({ message: "Revisa los campos del formulario antes de registrar" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prefill ? "Registrar Gasto desde CFDI" : "Registrar Gasto"}</DialogTitle>
        </DialogHeader>

        {prefill ? (
          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileText className="h-3.5 w-3.5" />
                Pre-llenado desde CFDI
                <Badge variant="outline" className="font-mono text-[10px]">
                  {prefill.cfdi_uuid.slice(0, 8)}…
                </Badge>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearCfdi}>
                <X className="h-3 w-3 mr-1" />Quitar
              </Button>
            </div>
            <p className="text-muted-foreground">
              <span className="font-medium">{prefill.emisor.nombre}</span>
              {prefill.emisor.rfc && <> · {prefill.emisor.rfc}</>}
            </p>
            {!prefill.supplier_match && prefill.emisor.rfc && !rfcLinked && (
              <div className="space-y-1.5 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2">
                <p className="text-amber-700 dark:text-amber-400">
                  ⚠ Proveedor no reconocido por RFC <span className="font-mono">{prefill.emisor.rfc}</span>.
                  Selecciona un proveedor existente y vincula este RFC para auto-reconocer futuras facturas.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!supplierId || linkRfc.isPending}
                  onClick={async () => {
                    if (!supplierId || !prefill?.emisor.rfc) return;
                    const result = await linkRfc.mutateAsync({
                      supplierId,
                      rfc: prefill.emisor.rfc,
                    });
                    if ("needsConfirm" in result) {
                      const ok = window.confirm(
                        `Este proveedor ya tiene el RFC "${result.currentRfc}". ¿Sobrescribir con "${prefill.emisor.rfc}"?`,
                      );
                      if (!ok) return;
                      await linkRfc.mutateAsync({
                        supplierId,
                        rfc: prefill.emisor.rfc,
                        overwrite: true,
                      });
                    }
                    setRfcLinked(true);
                  }}
                >
                  {linkRfc.isPending ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Vinculando…</>
                  ) : (
                    "Vincular RFC a este proveedor"
                  )}
                </Button>
                {!supplierId && (
                  <p className="text-[10px] text-muted-foreground">
                    Selecciona primero un proveedor abajo para habilitar la vinculación.
                  </p>
                )}
              </div>
            )}
            {rfcLinked && (
              <p className="text-emerald-600 dark:text-emerald-400">
                ✓ RFC vinculado al proveedor. Futuras facturas se reconocerán automáticamente.
              </p>
            )}
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            } ${cfdiLoading ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input {...getInputProps()} />
            {cfdiLoading ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Analizando CFDI…
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
                <Upload className="h-4 w-4" />
                <span>
                  <span className="font-medium text-foreground">Cargar XML del CFDI</span> para pre-llenar automáticamente · opcional
                </span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
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
