import { useState } from "react";
import { DuplicateIcon, SuccessIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ErrorReport } from "@/lib/ui/errorReport";
import { formatReportJson } from "@/lib/ui/errorReportJson";

interface Props {
  report: ErrorReport;
  onDetails?: () => void;
  extraAction?: { label: string; onClick: () => void };
}

/** Clipboard feedback stays beside the action; a failure never hides the report. */
export function ErrorReportActions({ report, onDetails, extraAction }: Props) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  async function copy() {
    setState("copying");
    try {
      await navigator.clipboard.writeText(formatReportJson(report));
      setState("copied");
    } catch {
      setState("failed");
      onDetails?.();
    }
  }
  return <div data-toast-actions="" className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" className="min-h-11" disabled={state === "copying"} onClick={() => void copy()}>
        {state === "copied" ? <SuccessIcon /> : <DuplicateIcon />}
        {state === "copied" ? "JSON copiado" : state === "copying" ? "Copiando…" : "Copiar JSON"}
      </Button>
      {onDetails && <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onDetails}>Ver detalles</Button>}
      {extraAction && <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={extraAction.onClick}>{extraAction.label}</Button>}
    </div>
    {(state === "failed" || state === "copied") && <p role="status" aria-live="polite" className={state === "failed" ? "text-xs text-destructive" : "sr-only"}>
      {state === "failed" ? "No se pudo copiar. Selecciona el JSON en los detalles para copiarlo manualmente." : "Diagnóstico JSON copiado al portapapeles."}
    </p>}
  </div>;
}
