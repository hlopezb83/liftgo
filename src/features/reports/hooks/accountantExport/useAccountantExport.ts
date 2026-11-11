import { useLayoutEffect, useRef, useState } from "react";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { useHasFinancialAccess, useHasModuleAccess } from "@/features/users";
import { toYMD } from "@/lib/format/dateFormats";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { buildAccountantSheets } from "../../lib/accountantExport/buildSheets";
import { downloadAccountantExport } from "../../lib/accountantExport/downloadExport";
import { fetchAccountantData } from "../../lib/accountantExport/fetchData";
import type { ExportOptions, Sections } from "../../lib/accountantExport/model";

function isValidRange(start: string, end: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end;
}

export function useAccountantExport(startDate: Date, endDate: Date) {
  const financial = useHasFinancialAccess();
  const reports = useHasModuleAccess("Reportes", "read");
  const sales = useHasModuleAccess("Facturas", "read");
  const purchases = useHasModuleAccess("Facturas de Proveedor", "read");
  const expenses = useHasModuleAccess("Gastos", "read");
  const organizationId = useVerifiedOrganizationId();
  const identity = useVerifiedIdentityScope();
  const [selected, setSelected] = useState<Sections>({ sales: true, purchases: true, expenses: true });
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
  const [includeDocuments, setIncludeDocuments] = useState(false);
  const [packageStatus, setPackageStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const permissions = { sales, purchases, expenses };
  const start = toYMD(startDate); const end = toYMD(endDate);
  const contextKey = JSON.stringify([identity, organizationId, financial, reports, permissions, selected, includeDrafts, includeTest, includeDocuments, start, end]);
  const latestKey = useRef(contextKey);
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    latestKey.current = contextKey;
    controller.current?.abort();
    controller.current = null;
    return () => { controller.current?.abort(); };
  }, [contextKey]);
  const validRange = isValidRange(start, end);
  const canExport = financial && reports && !!identity && !!organizationId && validRange &&
    (Object.keys(permissions) as (keyof Sections)[]).some((key) => permissions[key] && selected[key]);

  const download = async () => {
    if (!canExport || !organizationId || controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    abort.signal.addEventListener("abort", () => {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }, { once: true });
    const key = contextKey;
    const generation = epoch.current;
    const isCurrent = () => !abort.signal.aborted && epoch.current === generation && latestKey.current === key;
    const options: ExportOptions = { organizationId, start, end, includeDrafts, includeTest, includeDocuments,
      sections: { sales: sales && selected.sales, purchases: purchases && selected.purchases, expenses: expenses && selected.expenses } };
    setBusy(true); setError(null); setPackageStatus(null); setProgress(null);
    try {
      const data = await fetchAccountantData(options, permissions, abort.signal);
      if (!isCurrent()) return;
      const { fetchCompanyData } = await import("@/lib/pdf/shared");
      const { company } = await fetchCompanyData();
      if (!isCurrent()) return;
      const sheets = buildAccountantSheets(options, data, company, permissions);
      const message = await downloadAccountantExport(options, data, sheets, abort.signal, isCurrent, (done, total) => {
        if (isCurrent()) setProgress(`${done} de ${total} archivos revisados`);
      });
      if (isCurrent()) setPackageStatus(message);

    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "No se pudo completar la exportación. Vuelve a intentarlo.");
    } finally {
      if (controller.current === abort) { controller.current = null; setBusy(false); }
    }
  };

  const cancel = () => {
    epoch.current += 1;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  };
  return {
    canAccess: financial && reports, start, end, selected, setSelected, permissions,
    includeDrafts, setIncludeDrafts, includeTest, setIncludeTest, includeDocuments, setIncludeDocuments,
    validRange, canExport, busy, packageStatus, error, progress, download, cancel,
  };
}
