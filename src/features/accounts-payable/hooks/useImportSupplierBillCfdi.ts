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

type Supplier = { id: string; rfc?: string | null };

async function parseAndValidateXml(file: File): Promise<CfdiParsed> {
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
    throw new CfdiParseError(`Este CFDI ya está registrado como factura ${dup.bill_number}`);
  }
  return parsed;
}

function matchSupplierId(emitterRfc: string | null | undefined, suppliers: Supplier[] | undefined): string {
  if (!emitterRfc) return "";
  return suppliers?.find((s) => (s.rfc ?? "").toUpperCase() === emitterRfc)?.id ?? "";
}

function buildInitialValues(parsed: CfdiParsed, supplierId: string): Partial<SupplierBillFormData> {
  return {
    supplier_id: supplierId,
    currency: parsed.currency,
    exchange_rate: parsed.exchangeRate,
    subtotal: parsed.subtotal,
    tax_amount: parsed.taxAmount,
    retention_iva: parsed.retentionIva,
    retention_isr: parsed.retentionIsr,
    cfdi_uuid: parsed.uuid,
    payment_method_sat: parsed.paymentMethodSat ?? undefined,
    // ensure not null,
    issue_date: parsed.issueDate ?? new Date(),
    description: [parsed.serie, parsed.folio].filter(Boolean).join("-") || "",
  };
}

function warnIfRfcMismatch(receiverRfc: string | null | undefined, companyRfcRaw: string | null | undefined) {
  const companyRfc = companyRfcRaw?.toUpperCase() ?? null;
  if (companyRfc && receiverRfc && receiverRfc !== companyRfc) {
    notifyWarning("RFC receptor no coincide", {
      description: `CFDI emitido a ${receiverRfc}; configurado: ${companyRfc}.`,
    });
  }
}

function warnIfSupplierMissing(supplierId: string, emitterRfc: string | null | undefined) {
  if (supplierId) return;
  notifyWarning("Proveedor no encontrado por RFC", {
    description: `Selecciona manualmente el proveedor (RFC emisor: ${emitterRfc ?? "—"}).`,
  });
}

function extractImportErrorMessage(e: unknown): string {
  if (e instanceof CfdiParseError) return e.message;
  if (e instanceof Error) return e.message;
  return "No se pudo procesar el XML";
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
        const parsed = await parseAndValidateXml(file);
        const supplierId = matchSupplierId(parsed.emitterRfc, suppliers);
        const initialValues = buildInitialValues(parsed, supplierId);
        const uploaded = await uploadXml.mutateAsync({ file, uuid: parsed.uuid ?? "" });

        warnIfRfcMismatch(parsed.receiverRfc, company?.rfc);
        warnIfSupplierMissing(supplierId, parsed.emitterRfc);

        const next: ImportedCfdi = { parsed, uploaded, initialValues };
        setResult(next);
        return next;
      } catch (e: unknown) {
        setError(extractImportErrorMessage(e));
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
