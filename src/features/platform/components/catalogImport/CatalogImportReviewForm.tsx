import { useState } from "react";
import { FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { catalogImportInputSchema, type CatalogImportInput, type CatalogImportPreview } from "@/lib/platformCatalogImport.types";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useImportCatalogCandidate } from "../../hooks/usePlatformCatalogImport";

export function CatalogImportReviewForm({ preview, onDone, onPendingChange }: {
  preview: CatalogImportPreview; onDone: () => void; onPendingChange: (pending: boolean) => void;
}) {
  const mutation = useImportCatalogCandidate();
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [submitted, setSubmitted] = useState<CatalogImportInput | null>(null);
  const [error, setError] = useState(false);
  const submit = async () => {
    const input = submitted ?? { request_id: crypto.randomUUID(), kind: preview.kind, source_id: preview.source_id,
      fingerprint: preview.fingerprint, resolution: preview.status === "duplicate" ? "reuse" as const : "create" as const, reason };
    const parsed = catalogImportInputSchema.safeParse(input);
    if (!reviewed || !parsed.success) {
      notifyValidation({ message: "Confirma la revisión e indica un motivo de 5 a 500 caracteres." }); return;
    }
    setSubmitted(parsed.data); setError(false); onPendingChange(true);
    try { await mutation.mutateAsync(parsed.data); onDone(); }
    catch { setError(true); }
    finally { onPendingChange(false); }
  };
  const locked = !!submitted || mutation.isPending;
  return <div className="space-y-4">
    <div className="space-y-2"><Label htmlFor="catalog-import-reason">Motivo de incorporación</Label>
      <Textarea id="catalog-import-reason" value={reason} maxLength={500} rows={3} disabled={locked}
        onChange={(event) => setReason(event.target.value)} placeholder="Describe por qué este maestro debe formar parte del catálogo LiftGo." />
    </div>
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <Checkbox id="catalog-import-reviewed" checked={reviewed} disabled={locked}
        onCheckedChange={(value) => setReviewed(value === true)} />
      <Label htmlFor="catalog-import-reviewed" className="text-sm leading-relaxed">Revisé la comparación y autorizo esta incorporación al catálogo compartido.</Label>
    </div>
    {error && <p role="status" className="rounded-lg border p-3 text-sm">No se confirmó el resultado. Reintenta la misma solicitud; si los datos cambiaron, cierra y vuelve a abrir la revisión.</p>}
    <FormDialogFooter>
      <FormDialogCancelButton onCancel={onDone} disabled={mutation.isPending} />
      <Button onClick={() => void submit()} disabled={!reviewed || reason.trim().length < 5 || mutation.isPending}>
        {error ? "Reintentar incorporación" : preview.status === "duplicate" ? "Usar maestro existente" : "Crear maestro global"}
      </Button>
    </FormDialogFooter>
  </div>;
}
