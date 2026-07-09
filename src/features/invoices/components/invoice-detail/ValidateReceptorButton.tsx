import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { notifySuccess } from "@/lib/ui/appFeedback";
import {
  useValidateReceptorTaxInfo,
  type ReceptorValidationResult,
} from "../../hooks/invoiceDetail/useReceptorTaxInfo";
import { EditReceptorFiscalDialog } from "./EditReceptorFiscalDialog";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  invoice: Tables<"invoices">;
}

const FIELD_LABELS: Record<string, string> = {
  "customer.tax_id": "RFC del receptor",
  "customer.legal_name": "Razón social del receptor",
  "customer.tax_system": "Régimen fiscal del receptor",
  "customer.address.zip": "Código postal fiscal",
  "customer.zip": "Código postal fiscal",
};

function labelFor(path: string): string {
  return FIELD_LABELS[path] ?? path;
}

export function ValidateReceptorButton({ invoice }: Props) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [result, setResult] = useState<ReceptorValidationResult | null>(null);
  const validate = useValidateReceptorTaxInfo();

  const handleValidate = () => {
    setResult(null);
    setOpen(true);
    validate.mutate(invoice.id, {
      onSuccess: (data) => {
        setResult(data);
        if (data.is_valid) notifySuccess("Datos fiscales válidos según el SAT");
      },
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleValidate}>
        <ShieldCheck className="h-4 w-4 mr-1" /> Validar contra SAT
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        width="lg"
        title="Validación de datos fiscales del receptor"
        description="Consulta directa a la Constancia de Situación Fiscal del SAT vía Facturapi. No consume timbre."
      >
        {validate.isPending && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando al SAT…
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/30">
              <div><span className="text-muted-foreground">RFC:</span> <span className="font-mono">{result.sent.tax_id}</span></div>
              <div><span className="text-muted-foreground">Razón social:</span> <span className="font-mono">{result.sent.legal_name}</span></div>
              <div><span className="text-muted-foreground">Régimen:</span> <span className="font-mono">{result.sent.tax_system}</span></div>
              <div><span className="text-muted-foreground">CP:</span> <span className="font-mono">{result.sent.zip}</span></div>
            </div>

            {result.is_valid ? (
              <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-success" />
                <div>
                  <p className="font-medium">Los datos coinciden con la CSF del SAT.</p>
                  {result.note && <p className="text-xs text-muted-foreground mt-1">{result.note}</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive">El SAT rechazaría el timbrado.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Corrige el/los campos indicados antes de timbrar.
                    </p>
                  </div>
                </div>
                <ul className="text-sm space-y-1">
                  {result.errors.length === 0 && (
                    <li className="text-muted-foreground">
                      El PAC no detalló el campo. Verifica la CSF completa.
                    </li>
                  )}
                  {result.errors.map((e, i) => (
                    <li key={i} className="rounded border-l-2 border-destructive pl-2 py-1">
                      <span className="font-medium">{labelFor(e.path)}:</span>{" "}
                      <span className="text-muted-foreground">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <FormDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
          <Button
            onClick={() => {
              setOpen(false);
              setEditOpen(true);
            }}
          >
            <Pencil className="h-4 w-4 mr-1" /> Editar datos fiscales
          </Button>
        </FormDialogFooter>
      </FormDialog>

      <EditReceptorFiscalDialog open={editOpen} onOpenChange={setEditOpen} invoice={invoice} />
    </>
  );
}
