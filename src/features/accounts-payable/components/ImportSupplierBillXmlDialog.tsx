import { useCallback, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import { useSuppliers } from "@/features/suppliers";
import { useCompanySettings } from "@/features/company-settings/hooks/useCompanySettings";
import { parseCfdiXml, CfdiParseError, type CfdiParsed } from "../lib/parseCfdiXml";
import { useUploadSupplierBillXml, type UploadedCfdiXml } from "../hooks/useUploadSupplierBillXml";
import { SupplierBillFormDialog } from "./SupplierBillFormDialog";
import type { SupplierBillFormData } from "../hooks/useSupplierBillForm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PreparedImport {
  parsed: CfdiParsed;
  file: File;
  supplierId: string;
  initialValues: Partial<SupplierBillFormData>;
}

export function ImportSupplierBillXmlDialog({ open, onOpenChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [uploaded, setUploaded] = useState<UploadedCfdiXml | null>(null);

  const { data: suppliers } = useSuppliers();
  const { data: company } = useCompanySettings();
  const uploadXml = useUploadSupplierBillXml();

  const companyRfc = useMemo(() => company?.rfc?.toUpperCase() ?? null, [company?.rfc]);

  const reset = useCallback(() => {
    setError(null);
    setBusy(false);
    setPrepared(null);
    setUploaded(null);
    setDragging(false);
  }, []);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        if (!/\.xml$/i.test(file.name)) {
          throw new CfdiParseError("Selecciona un archivo .xml");
        }
        const text = await file.text();
        const parsed = parseCfdiXml(text);

        if (!parsed.uuid) {
          throw new CfdiParseError("El CFDI no tiene UUID (TimbreFiscalDigital)");
        }

        // Verificar duplicado de UUID
        const { data: dup, error: dupErr } = await supabase
          .from("supplier_bills")
          .select("id, bill_number")
          .eq("cfdi_uuid", parsed.uuid)
          .maybeSingle();
        if (dupErr) throw dupErr;
        if (dup) {
          throw new CfdiParseError(
            `Este CFDI ya está registrado como factura ${dup.bill_number}`,
          );
        }

        // Match proveedor por RFC
        const supplierMatch = parsed.emitterRfc
          ? suppliers?.find(
              (s) => (s.rfc ?? "").toUpperCase() === parsed.emitterRfc,
            )
          : null;
        const supplierId = supplierMatch?.id ?? "";

        const initialValues: Partial<SupplierBillFormData> = {
          supplier_id: supplierId,
          currency: parsed.currency,
          exchange_rate: parsed.exchangeRate,
          subtotal: parsed.subtotal,
          tax_amount: parsed.taxAmount,
          retention_iva: parsed.retentionIva,
          retention_isr: parsed.retentionIsr,
          cfdi_uuid: parsed.uuid,
          payment_method_sat: parsed.paymentMethodSat ?? undefined,
          issue_date: parsed.issueDate ?? new Date(),
          description: [parsed.serie, parsed.folio].filter(Boolean).join("-") || "",
        };

        // Subir XML a Storage
        const up = await uploadXml.mutateAsync({ file, uuid: parsed.uuid });

        setPrepared({ parsed, file, supplierId, initialValues });
        setUploaded(up);
      } catch (e: unknown) {
        const msg =
          e instanceof CfdiParseError
            ? e.message
            : e instanceof Error
              ? e.message
              : "No se pudo procesar el XML";
        setError(msg);
        if (!(e instanceof CfdiParseError)) {
          notifyError({ error: e, message: "Error al importar XML" });
        }
      } finally {
        setBusy(false);
      }
    },
    [suppliers, uploadXml],
  );

  const onPickFile = (file: File | null) => {
    if (file) void processFile(file);
  };

  const showPreview = prepared !== null;

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar factura desde XML (CFDI)</DialogTitle>
            <DialogDescription>
              Selecciona el XML emitido por el proveedor. Se extraerán los datos fiscales y podrás revisarlos antes de registrar.
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0] ?? null;
              onPickFile(file);
            }}
            disabled={busy}
            className={`w-full rounded-lg border-2 border-dashed p-8 transition-colors flex flex-col items-center justify-center gap-2 ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60"
            } ${busy ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
          >
            {busy ? (
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
            ) : (
              <FileUp className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {busy ? "Procesando…" : "Arrastra el XML aquí o haz clic"}
            </span>
            <span className="text-xs text-muted-foreground">CFDI 4.0 · máx. 2 MB</span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No se pudo importar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {prepared && uploaded && (
        <SupplierBillFormDialog
          open
          titleOverride="Revisar factura importada (CFDI)"
          onOpenChange={(next) => {
            if (!next) handleClose(false);
          }}
          overrides={{
            initialValues: prepared.initialValues,
            cfdiXmlUrl: uploaded.signedUrl,
          }}
        />
      )}

      {prepared && companyRfc && prepared.parsed.receiverRfc && prepared.parsed.receiverRfc !== companyRfc && (
        <Alert variant="default" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>RFC receptor no coincide</AlertTitle>
          <AlertDescription>
            El CFDI fue emitido a {prepared.parsed.receiverRfc}, pero el RFC configurado es {companyRfc}.
          </AlertDescription>
        </Alert>
      )}

      {prepared && !prepared.supplierId && (
        <Alert variant="default" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Proveedor no encontrado</AlertTitle>
          <AlertDescription>
            No hay proveedor con RFC {prepared.parsed.emitterRfc}. Selecciónalo manualmente o créalo desde el módulo Proveedores.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
