import { useCallback, useState } from "react";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import { useSuppliers } from "@/features/suppliers";
import { useCompanySettings } from "@/features/company-settings";
import { parseCfdiXml, CfdiParseError, type CfdiParsed } from "../lib/parseCfdiXml";
import { useUploadSupplierBillXml, type UploadedCfdiXml } from "./useUploadSupplierBillXml";
import { checkSupplierBillCfdiUuid } from "./useCheckSupplierBillCfdiUuid";
import type { SupplierBillFormData } from "./useSupplierBillForm";

export interface ImportedCfdi {
  parsed: CfdiParsed;
  uploaded: UploadedCfdiXml;
  initialValues: Partial<SupplierBillFormData>;
}

export function useImportSupplierBillCfdi() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportedCfdi | null>(null);

  const { data: suppliers } = useSuppliers();
  const { data: company } = useCompanySettings();
  const uploadXml = useUploadSupplierBillXml();

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
    setResult(null);
  }, []);

  const importXml = useCallback(
    async (file: File): Promise<ImportedCfdi | null> => {
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
        const dup = await checkSupplierBillCfdiUuid(parsed.uuid);
        if (dup) {
          throw new CfdiParseError(
            `Este CFDI ya está registrado como factura ${dup.bill_number}`,
          );
        }
        const supplierMatch = parsed.emitterRfc
          ? suppliers?.find((s) => (s.rfc ?? "").toUpperCase() === parsed.emitterRfc)
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

        const uploaded = await uploadXml.mutateAsync({ file, uuid: parsed.uuid });

        const companyRfc = company?.rfc?.toUpperCase() ?? null;
        if (companyRfc && parsed.receiverRfc && parsed.receiverRfc !== companyRfc) {
          notifyWarning("RFC receptor no coincide", {
            description: `CFDI emitido a ${parsed.receiverRfc}; configurado: ${companyRfc}.`,
          });
        }
        if (!supplierId) {
          notifyWarning("Proveedor no encontrado por RFC", {
            description: `Selecciona manualmente el proveedor (RFC emisor: ${parsed.emitterRfc ?? "—"}).`,
          });
        }

        const next: ImportedCfdi = { parsed, uploaded, initialValues };
        setResult(next);
        return next;
      } catch (e: unknown) {
        const msg = e instanceof CfdiParseError
          ? e.message
          : e instanceof Error
            ? e.message
            : "No se pudo procesar el XML";
        setError(msg);
        if (!(e instanceof CfdiParseError)) {
          notifyError({ error: e, message: "Error al importar XML" });
        }
        return null;
      } finally {
        setBusy(false);
      }
    },
    [suppliers, uploadXml, company?.rfc],
  );

  return { importXml, busy, error, reset, result };
}
