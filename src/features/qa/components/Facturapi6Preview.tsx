import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PREVIEW_WINDOW, type PreflightResult } from "@/lib/qa/facturapi6-preview/policy";
import { previewIssuerPreflight } from "@/lib/qa/facturapi6-preview/preflight.functions";

export function Facturapi6Preview() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [attempted, setAttempted] = useState(false);
  const run = useServerFn(previewIssuerPreflight);
  const disabled = !PREVIEW_WINDOW.enabled || PREVIEW_WINDOW.shutdown || !import.meta.env.DEV;
  async function check() {
    if (disabled || pending || attempted) return;
    setAttempted(true);
    setPending(true);
    try { setResult(await run({ data: null })); }
    catch { setResult({ ok: false, status: 503, code: "unavailable" }); }
    finally { setPending(false); }
  }
  return <main className="mx-auto max-w-2xl space-y-8 px-5 py-12 text-foreground">
    <header className="space-y-3">
      <ShieldCheck className="size-8 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Verificación temporal Facturapi 6</h1>
      <p className="text-muted-foreground">ELOGISTIX SHIPPING · Empresa Prueba</p>
    </header>
    <section className="space-y-5 border-y border-border py-6">
      <p className="flex items-center gap-2 font-medium"><LockKeyhole className="size-4 shrink-0" aria-hidden="true" />{disabled ? "Deshabilitada · pendiente de revisión" : "Ventana de revisión abierta"}</p>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <dt className="text-muted-foreground">Emisor</dt><dd>{result?.ok ? "Coincide" : "Sin comprobar"}</dd>
        <dt className="text-muted-foreground">Modo sandbox</dt><dd>{result?.sandboxConfirmed ? "Confirmado" : "Sin comprobar"}</dd>
        <dt className="text-muted-foreground">Documentos emitidos</dt><dd>0</dd>
      </dl>
      <Button onClick={check} disabled={disabled || pending || attempted} className="max-w-full whitespace-normal">
        <ShieldCheck aria-hidden="true" />{pending ? "Comprobando…" : "Comprobar emisor sandbox"}
      </Button>
      {result && <p role="status" className="text-sm text-muted-foreground">{result.ok ? "Emisor sandbox verificado." : `Comprobación detenida (${result.status}).`}</p>}
    </section>
  </main>;
}
