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
