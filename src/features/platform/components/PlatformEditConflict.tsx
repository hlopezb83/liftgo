import { useState, type ReactNode } from "react";
import { ErrorDiagnostic } from "@/components/feedback/ErrorDiagnostic";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type CurrentEdit = { token: string | null; preview: ReactNode };

export function PlatformEditConflict({ loadCurrent, onUseCurrent }: {
  loadCurrent: () => Promise<CurrentEdit>;
  onUseCurrent: (token: string | null) => void;
}) {
  const [current, setCurrent] = useState<CurrentEdit | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function review() {
    setPending(true); setError(null);
    try { setCurrent(await loadCurrent()); }
    catch (failure) { setError(failure); }
    finally { setPending(false); }
  }
  return <Alert>
    <AlertTitle>El contenido cambió mientras editabas</AlertTitle>
    <AlertDescription className="space-y-4">
      <p>Tu captura se conserva. Revisa el contenido guardado antes de volver a guardar.</p>
      {current ? <>
        <div className="space-y-3"><p className="font-medium">Contenido guardado actualmente</p>{current.preview}</div>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => onUseCurrent(current.token)}>
          Conservar mi captura y usar esta revisión
        </Button>
      </> : <Button type="button" variant="outline" disabled={pending} onClick={() => void review()}>
        {pending ? "Consultando…" : "Revisar contenido actual"}
      </Button>}
      {error != null && <ErrorDiagnostic error={error} title="No se pudo consultar el contenido actual" phase="query" />}
    </AlertDescription>
  </Alert>;
}

export function PlatformCurrentFields({ values }: { values: Record<string, string> }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(values).map(([label, value]) =>
    <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value || "Sin capturar"}</dd></div>)}</dl>;
}
