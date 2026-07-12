import { useState } from "react";
import { useCopyToClipboard } from "usehooks-ts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DuplicateIcon, Check } from "@/components/icons";
import { useErrorReport, closeErrorReport } from "@/lib/ui/errorDetailsStore";
import { formatReportText } from "@/lib/ui/errorReportFormat";
import { notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";

/**
 * Diálogo global de detalles de error. Montar una sola vez en el root.
 * Se controla vía `openErrorReport()` desde cualquier toast destructive.
 */
export function ErrorDetailsDialog() {
  const { open, report } = useErrorReport();
  const [, copy] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);

  const text = report ? formatReportText(report) : "";

  const handleCopy = async () => {
    if (!text) return;
    const ok = await copy(text);
    if (ok) {
      setCopied(true);
      notifySuccess("Reporte copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } else {
      notifyWarning("No se pudo copiar. Selecciona el texto manualmente y usa Ctrl+C.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeErrorReport(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detalles del error</DialogTitle>
        </DialogHeader>
        {report && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Copia este reporte y compártelo con soporte para que podamos ayudarte más rápido.
            </div>
            <pre className="max-h-[50vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
              {text}
            </pre>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => closeErrorReport()}>Cerrar</Button>
          <Button onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 mr-2" /> : <DuplicateIcon className="h-4 w-4 mr-2" />}
            {copied ? "Copiado" : "Copiar reporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
