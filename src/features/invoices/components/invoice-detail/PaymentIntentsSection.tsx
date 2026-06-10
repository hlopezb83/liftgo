import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminPaymentIntents,
  useReviewPaymentIntent,
} from "@/features/portal/hooks/usePortalExtras";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { openStorageFile } from "@/lib/storage/openStorageFile";
import { PAYMENT_INTENT_STATUS as STATUS_LABEL } from "@/lib/domain/paymentIntentStatus";

interface Props {
  invoiceId: string;
}


export function PaymentIntentsSection({ invoiceId }: Props) {
  const { data: intents } = useAdminPaymentIntents(invoiceId);
  const review = useReviewPaymentIntent();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  if (!intents || intents.length === 0) return null;

  const openProof = (path: string) =>
    openStorageFile("payment-proofs", path, { errorMessage: "No se pudo abrir el comprobante" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intentos de pago reportados por el cliente</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Banco</th>
              <th className="text-left px-3 py-2">Rastreo</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {intents.map((i, idx) => {
              const meta = STATUS_LABEL[i.status] ?? { label: i.status, variant: "outline" as const };
              const pending = i.status === "pending_review";
              return (
                <tr key={i.id} className={idx % 2 ? "bg-muted/20" : ""}>
                  <td className="px-3 py-2">{formatDateDisplay(i.transfer_date)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(i.amount))}</td>
                  <td className="px-3 py-2">
                    {i.sender_bank ?? "—"}{i.sender_last4 ? ` ····${i.sender_last4}` : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{i.tracking_key ?? "—"}</td>
                  <td className="px-3 py-2"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {i.proof_url && (
                      <Button size="sm" variant="ghost" onClick={() => openProof(i.proof_url ?? "")}>
                        Comprobante
                      </Button>
                    )}
                    {pending && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            review.mutate({
                              intentId: i.id,
                              action: "approve",
                              invoiceId,
                              amount: Number(i.amount),
                              transferDate: i.transfer_date,
                              trackingKey: i.tracking_key,
                            })
                          }
                        >
                          Aprobar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setRejectId(i.id); setRejectNotes(""); }}>
                          Rechazar
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>

      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar reporte de pago</DialogTitle></DialogHeader>
          <Textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Motivo del rechazo (visible para el cliente)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!rejectNotes.trim()}
              onClick={() => {
                if (!rejectId) return;
                const intent = intents.find((x) => x.id === rejectId);
                if (!intent) return;
                review.mutate(
                  {
                    intentId: rejectId,
                    action: "reject",
                    notes: rejectNotes.trim(),
                    invoiceId,
                    amount: Number(intent.amount),
                    transferDate: intent.transfer_date,
                    trackingKey: intent.tracking_key,
                  },
                  { onSuccess: () => setRejectId(null) },
                );
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
