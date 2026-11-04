import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { legacyClassifications, originalLineField, type LegacyChargeReview, type LegacyClassification, type LegacyReviewSelection } from "../../lib/quoteChargeLegacyReview";
import type { LegacyReviewInput, LegacyReverseInput } from "../../hooks/invoices/useQuoteChargeLegacyReview";

interface Props {
  data: LegacyChargeReview;
  selection: LegacyReviewSelection;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onReconcile: (input: LegacyReviewInput) => Promise<void>;
  onReverse: (input: LegacyReverseInput) => Promise<void>;
}

function validInput(reason: string, evidence: string, classification: string, quoteLineId: string, quantity: string, reverse: boolean) {
  if (reason.trim().length < 3 || reason.trim().length > 4000
    || evidence.trim().length < 3 || evidence.trim().length > 10000) return false;
  if (reverse) return true;
  if (!classification) return false;
  if (classification !== "charge") return true;
  return quoteLineId !== "" && quantity.trim() !== "" && Number.isFinite(Number(quantity)) && Number(quantity) > 0;
}

/** The original invoice row is evidence only. No fields are written back to it. */
export function LegacyReviewForm({ data, selection, pending, error, onCancel, onReconcile, onReverse }: Props) {
  const [classification, setClassification] = useState<LegacyClassification | "">("");
  const [quoteLineId, setQuoteLineId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = useRef(false);
  const isCharge = classification === "charge";
  const numericQuantity = Number(quantity);
  const valid = validInput(reason, evidence, classification, quoteLineId, quantity, selection.reverse);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending || submitting.current) return;
    const payload = {
      reason: reason.trim(), evidence: evidence.trim(), classification,
      quoteLineId: isCharge ? quoteLineId : null, quantity: isCharge ? numericQuantity : null,
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    const requestKey = request.current.key;
    submitting.current = true;
    try {
      if (selection.reverse && selection.line.review) {
        await onReverse({ reviewId: selection.line.review.id, reason: payload.reason, evidence: payload.evidence, requestKey });
      } else if (classification) {
        await onReconcile({ ...payload, classification, invoiceId: selection.invoice.invoice_id,
          lineIndex: selection.line.line_index, expectedHash: selection.line.line_hash, requestKey });
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => { void submit(event); }}>
      <div className="rounded-md border p-3 text-sm space-y-2">
        <p className="font-medium">{selection.invoice.invoice_number ?? selection.invoice.invoice_id} · Partida {selection.line.line_index + 1}</p>
        <p>{String(originalLineField(selection.line.line, "description") ?? "Sin descripción")}</p>
        <p className="text-muted-foreground">Cantidad original: {String(originalLineField(selection.line.line, "quantity") ?? "No disponible")} · Precio unitario: {String(originalLineField(selection.line.line, "unit_price") ?? "No disponible")}</p>
        <details><summary className="cursor-pointer">Ver partida original completa</summary><pre className="whitespace-pre-wrap break-all text-xs mt-2">{JSON.stringify(selection.line.line, null, 2)}</pre></details>
      </div>
      {selection.reverse ? (
        <p className="text-sm">La reversión quedará auditada. Esta partida volverá a requerir revisión; el servidor comprobará la disponibilidad y los vínculos.</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="legacy-classification">Clasificación revisada</Label>
            <select id="legacy-classification" required disabled={pending} value={classification} className="w-full rounded-md border bg-background p-2 text-sm" onChange={(event) => setClassification(event.target.value as LegacyClassification | "")}>
              <option value="">Selecciona según la evidencia</option>
              {Object.entries(legacyClassifications).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {isCharge && (
            <>
              <div className="space-y-2">
                <Label htmlFor="legacy-quote-charge">Cargo de {data.quote_number}</Label>
                <select id="legacy-quote-charge" required disabled={pending} value={quoteLineId} className="w-full rounded-md border bg-background p-2 text-sm" onChange={(event) => setQuoteLineId(event.target.value)}>
                  <option value="">Selecciona el cargo verificado</option>
                  {data.charges.map((charge) => <option key={charge.quote_line_id} value={charge.quote_line_id}>{String(charge.line.description ?? "Cargo")} · disponible {charge.remaining_quantity} de {charge.quoted_quantity}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="legacy-quantity">Cantidad histórica a vincular</Label>
                <Input id="legacy-quantity" type="number" step="any" min="0" required disabled={pending} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </div>
            </>
          )}
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor="legacy-reason">Motivo obligatorio</Label>
        <Textarea id="legacy-reason" required minLength={3} maxLength={4000} disabled={pending} value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="legacy-evidence">Evidencia revisada obligatoria</Label>
        <Textarea id="legacy-evidence" required minLength={3} maxLength={10000} disabled={pending} value={evidence} placeholder="Documentos y referencias que sustentan esta decisión" onChange={(event) => setEvidence(event.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error} Puedes reintentar la misma solicitud.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancelar revisión</Button>
        <Button type="submit" disabled={!valid || pending}>{pending ? "Guardando…" : selection.reverse ? "Revertir con auditoría" : "Guardar conciliación"}</Button>
      </div>
    </form>
  );
}
