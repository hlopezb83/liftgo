import { ErrorReportActions } from "@/components/feedback/ErrorReportActions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { closeErrorReport, useErrorReport } from "@/lib/ui/errorDetailsStore";
import type { ErrorReport } from "@/lib/ui/errorReport";
import { formatReportJson } from "@/lib/ui/errorReportJson";

export function ErrorReportDialog({ open, report, onClose }: { open: boolean; report: ErrorReport | null; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader className="pr-8 text-left">
        <DialogTitle>Detalles del error</DialogTitle>
        <DialogDescription>Revisa el diagnóstico y copia el JSON para compartirlo con soporte.</DialogDescription>
      </DialogHeader>
      {report && <div className="min-w-0 space-y-4">
        <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
          <p className="break-words text-sm font-medium">{report.title}</p>
          <p className="break-all font-mono text-xs text-muted-foreground">{report.errorCode} · {report.requestId}</p>
        </div>
        <Textarea aria-label="Diagnóstico del error en JSON" readOnly value={formatReportJson(report)}
          className="h-[min(45dvh,24rem)] min-h-40 resize-none whitespace-pre-wrap break-all font-mono text-xs leading-relaxed"
          onFocus={(event) => event.currentTarget.select()} />
        <ErrorReportActions key={report.requestId} report={report} />
      </div>}
      <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={onClose}>Cerrar detalles</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Mounted once globally; standalone error screens also use ErrorReportDialog. */
export function ErrorDetailsDialog() {
  const { open, report } = useErrorReport();
  return <ErrorReportDialog open={open} report={report} onClose={closeErrorReport} />;
}
