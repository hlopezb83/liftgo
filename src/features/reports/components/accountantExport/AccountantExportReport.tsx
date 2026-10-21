import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { useHasFinancialAccess, useHasModuleAccess } from "@/features/users";
import { toYMD } from "@/lib/format/dateFormats";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { buildAccountantSheets } from "../../lib/accountantExport/buildSheets";
import { downloadAccountantExport } from "../../lib/accountantExport/downloadExport";
import { fetchAccountantData } from "../../lib/accountantExport/fetchData";
import type { ExportOptions, Sections } from "../../lib/accountantExport/model";

const LABELS: Record<keyof Sections, string> = {
  sales: "Ventas, notas de crédito, cobros y REP asociados",
  purchases: "Compras y pagos a proveedores",
  expenses: "Gastos operativos legados con empresa verificada",
};

function isValidRange(start: string, end: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end;
}

export function AccountantExportReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
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
      if (controller.current === abort) { controller.current = null; setBusy(false); }
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
      const { fetchCompanyDataAndLogo } = await import("@/lib/pdf/shared");
      const { company } = await fetchCompanyDataAndLogo();
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

  if (!financial || !reports) return <p role="alert">No tienes permiso para exportar reportes financieros.</p>;
  return <Card>
    <CardHeader><CardTitle>Exportar para contador</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Empresa actual verificada, del {start} al {end}. Excel operativo con documentos y relaciones; no crea pólizas ni sustituye CONTPAQi. No se envía a terceros.</p>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Secciones</legend>
        {(Object.keys(LABELS) as (keyof Sections)[]).map((key) => <div key={key} className="flex items-start gap-2">
          <Checkbox id={`accountant-${key}`} checked={selected[key] && permissions[key]} disabled={!permissions[key]}
            onCheckedChange={(checked) => setSelected((previous) => ({ ...previous, [key]: checked === true }))} />
          <Label htmlFor={`accountant-${key}`}>{LABELS[key]}{!permissions[key] && " (sin permiso; no se consultará)"}</Label>
        </div>)}
        <div className="flex items-center gap-2"><Checkbox id="accountant-drafts" checked={includeDrafts} onCheckedChange={(value) => setIncludeDrafts(value === true)} /><Label htmlFor="accountant-drafts">Incluir borradores identificados</Label></div>
        <div className="flex items-center gap-2"><Checkbox id="accountant-test" checked={includeTest} onCheckedChange={(value) => setIncludeTest(value === true)} /><Label htmlFor="accountant-test">Incluir Sandbox/E2E identificados como pruebas</Label></div>
        <div className="flex items-center gap-2"><Checkbox id="accountant-documents" checked={includeDocuments} onCheckedChange={(value) => setIncludeDocuments(value === true)} /><Label htmlFor="accountant-documents">Incluir XML/PDF existentes en un ZIP con el mismo Excel</Label></div>
      </fieldset>
      <p className="text-xs text-muted-foreground">Cancelados se conservan separados por estado. Ambientes desconocidos no se consideran producción. Es una extracción paginada, no un cierre bloqueado. Gastos sin empresa verificable no se incluyen; revisa el alcance y los conteos en Control. El ZIP sólo consulta archivos existentes con tus permisos actuales; no los recupera del PAC. Máximo 500 archivos candidatos XML/PDF, 10 MiB por archivo y 100 MiB de soportes. Faltantes o archivos no verificables se indican en un paquete INCOMPLETO.</p>
      <ExportFeedback validRange={validRange} packageStatus={packageStatus} error={error} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={download} disabled={!canExport || busy}>{busy ? "Preparando exportación…" : includeDocuments ? "Descargar paquete para contador" : "Descargar Excel para contador"}</Button>
        {busy && <Button variant="outline" onClick={() => { epoch.current += 1; controller.current?.abort(); controller.current = null; setBusy(false); }}>Cancelar exportación</Button>}
      </div>
      {busy && <p role="status" aria-live="polite" className="text-sm">{progress ?? "Consultando todas las páginas autorizadas."} Cambiar empresa, permisos o fechas cancela la descarga.</p>}
    </CardContent>
  </Card>;
}

function ExportFeedback({ validRange, packageStatus, error }: { validRange: boolean; packageStatus: string | null; error: string | null }) {
  return <>
    {!validRange && <p role="alert" className="text-sm text-destructive">El rango de fechas no es válido.</p>}
    {packageStatus && <p role="status" className="text-sm font-medium">{packageStatus}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </>;
}
