import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAccountantExport } from "../../hooks/accountantExport/useAccountantExport";
import type { Sections } from "../../lib/accountantExport/model";

const LABELS: Record<keyof Sections, string> = {
  sales: "Ventas, notas de crédito, cobros y REP asociados",
  purchases: "Compras y pagos a proveedores",
  expenses: "Gastos operativos legados con empresa verificada",
};

export function AccountantExportReport({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const {
    canAccess, start, end, selected, setSelected, permissions,
    includeDrafts, setIncludeDrafts, includeTest, setIncludeTest, includeDocuments, setIncludeDocuments,
    validRange, canExport, busy, packageStatus, error, progress, download, cancel,
  } = useAccountantExport(startDate, endDate);

  if (!canAccess) return <p role="alert">No tienes permiso para exportar reportes financieros.</p>;
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
        {busy && <Button variant="outline" onClick={cancel}>Cancelar exportación</Button>}
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
