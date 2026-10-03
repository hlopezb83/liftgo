import { useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  organizationGovernanceInputSchema, type OrganizationGovernance, type OrganizationGovernanceFields as GovernanceFieldsValues,
} from "@/lib/platformOrganizationGovernance.types";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { extractErrorDetails } from "@/lib/ui/errorDetailsExtract";
import { useSetOrganizationGovernance } from "../hooks/useOrganizationGovernance";
import { OrganizationGovernanceFields } from "./OrganizationGovernanceFields";
import { OrganizationGovernanceSummary } from "./OrganizationGovernanceSummary";

export function OrganizationGovernanceEditor({
  initial, onClose, reload,
}: { initial: OrganizationGovernance; onClose: () => void; reload: () => Promise<OrganizationGovernance | undefined> }) {
  const mutation = useSetOrganizationGovernance();
  const [values, setValues] = useState<GovernanceFieldsValues>({
    classification: initial.classification, city: initial.city ?? "", territory: initial.territory ?? "",
    contactName: initial.contactName ?? "", contactEmail: initial.contactEmail ?? "", contactPhone: initial.contactPhone ?? "",
  });
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState(initial.revision);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<OrganizationGovernance | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [reviewError, setReviewError] = useState("");
  async function review() {
    setLoadingLatest(true); setReviewError("");
    try {
      const data = await reload();
      if (!data) throw new Error("missing");
      setLatest(data);
    } catch { setReviewError("No se pudieron consultar los datos actuales. Tu captura se conserva."); }
    finally { setLoadingLatest(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (conflict || mutation.isPending) return;
    const input = organizationGovernanceInputSchema.safeParse({ ...values, reason, revision, organizationId: initial.organizationId });
    if (!input.success) {
      notifyValidation({ message: input.error.issues[0]?.message ?? "Revisa los datos capturados" }); return;
    }
    try { await mutation.mutateAsync(input.data); onClose(); }
    catch (error) {
      if (extractErrorDetails(error).status === 409 || /Los datos cambiaron/.test(error instanceof Error ? error.message : "")) setConflict(true);
    }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Datos de la empresa</DialogTitle>
        <DialogDescription>Define el territorio, el contacto y la clasificación administrativa.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(e) => void save(e)} className="space-y-5">
        <OrganizationGovernanceFields values={values} reason={reason} disabled={mutation.isPending} onChange={setValues} onReason={setReason} />
        {conflict && <Alert>
          <AlertTitle>La ficha cambió mientras capturabas</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>Tu captura se conserva. Revisa los datos guardados antes de volver a guardar.</p>
            {latest ? <div className="space-y-4">
              <p className="font-medium">Datos guardados actualmente</p>
              <OrganizationGovernanceSummary data={latest} />
              <Button type="button" variant="outline" onClick={() => { setRevision(latest.revision); setConflict(false); setLatest(null); }}>
                Conservar mi captura y usar esta revisión
              </Button>
            </div> : <Button type="button" variant="outline" disabled={loadingLatest} onClick={() => void review()}>
              {loadingLatest ? "Consultando…" : "Revisar datos actuales"}
            </Button>}
            {reviewError && <p role="alert">{reviewError}</p>}
          </AlertDescription>
        </Alert>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending || conflict}>{mutation.isPending ? "Guardando…" : "Guardar datos"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
