import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, Loader2 } from "lucide-react";
import { useUploadSupplierRep } from "../hooks/useSupplierRepMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  billId: string;
  paymentAmountLabel: string;
}

export function UploadSupplierRepDialog({
  open, onOpenChange, paymentId, billId, paymentAmountLabel,
}: Props) {
  const [xml, setXml] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const upload = useUploadSupplierRep();

  const handleSubmit = () => {
    if (!xml) return;
    upload.mutate(
      { paymentId, xmlFile: xml, pdfFile: pdf, billId },
      { onSuccess: () => { setXml(null); setPdf(null); onOpenChange(false); } },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!upload.isPending) onOpenChange(o); }}
      title="Cargar Complemento de Pago"
      description={`Carga el XML del REP que envió el proveedor por el pago de ${paymentAmountLabel}. Se valida tipo P, RFC del emisor, UUID de la factura y monto.`}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rep-xml">XML del REP (obligatorio)</Label>
          <Input
            id="rep-xml"
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={(e) => setXml(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rep-pdf">PDF del REP (opcional)</Label>
          <Input
            id="rep-pdf"
            type="file"
            accept="application/pdf"
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <FormDialogFooter>
        <Button variant="outline" disabled={upload.isPending} onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button disabled={!xml || upload.isPending} onClick={handleSubmit}>
          {upload.isPending ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Validando…</>
          ) : (
            <><Upload className="h-4 w-4 mr-1" /> Cargar y validar</>
          )}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
