import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { ErrorDiagnostic } from "@/components/feedback/ErrorDiagnostic";
import { Button } from "@/components/ui/button";
import { getPlatformSupportScreenshotFn } from "@/lib/platformSupport.functions";
import type { SupportCase } from "@/lib/platformSupport.types";
import { healthDate } from "../hooks/usePlatformHealth";

function SupportCapture({ caseId }: { caseId: string }) {
  const capture = useMutation({ mutationFn: () => getPlatformSupportScreenshotFn({ data: { caseId } }), meta: { silent: true } });
  const { data, reset } = capture;
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(reset, data.expiresIn * 1000);
    return () => clearTimeout(timer);
  }, [data, reset]);
  return <section className="space-y-3" aria-label="Captura compartida">
    <Button variant="outline" disabled={capture.isPending} onClick={() => capture.mutate()}>Abrir captura compartida</Button>
    {capture.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{capture.error.message}</p>
      <ErrorDiagnostic error={capture.error} title="No se pudo abrir la captura compartida" phase="support-screenshot" /></div>}
    {data && <><a href={data.url} target="_blank" rel="noopener noreferrer"><img src={data.url} alt="Captura compartida por el reportante" className="max-h-80 w-full rounded-lg border object-contain" /></a>
      <p className="text-xs text-muted-foreground">El enlace vence en un minuto. Puedes solicitar uno nuevo.</p></>}
  </section>;
}
export function PlatformSupportDiagnostic({ record }: { record: SupportCase }) {
  return <>
    <div className="space-y-3"><h2 className="break-words text-lg font-semibold">{record.title}</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{record.description}</p>
      <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Módulo</dt><dd>{record.module || "Sin clasificar"}</dd></div>
        <div><dt className="text-muted-foreground">Versión al reportar</dt><dd>{record.appVersion || "Sin registro"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">requestId</dt><dd className="break-all font-mono text-xs">{record.requestId || "Sin registro"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">Diagnóstico disponible hasta</dt><dd>{healthDate(record.sharedUntil)}</dd></div>
      </dl></div>
    {record.hasScreenshot && <SupportCapture key={record.revision} caseId={record.id} />}
  </>;
}
