import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import {
  usePortalQuote,
  useAcceptPortalQuote,
  useRejectPortalQuote,
} from "../hooks/usePortalExtras";

interface LineItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
}

export default function PortalQuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: quote, isLoading } = usePortalQuote(id);
  const accept = useAcceptPortalQuote();
  const reject = useRejectPortalQuote();
  const [agreed, setAgreed] = useState(false);
  const [rejectingMode, setRejectingMode] = useState(false);
  const [reason, setReason] = useState("");

  if (isLoading) return <Skeleton className="h-96" />;
  if (!quote) return <p className="text-muted-foreground">Cotización no encontrada</p>;

  const items: LineItem[] = Array.isArray(quote.line_items) ? (quote.line_items as LineItem[]) : [];
  const canAct = quote.status === "sent";
  const wasAccepted = quote.status === "accepted" || !!quote.accepted_at;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/portal/quotes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{quote.quote_number}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={quote.status} />
            <span className="text-sm text-muted-foreground">
              Emitida {formatDateDisplay(quote.created_at)}
            </span>
            {quote.valid_until && (
              <span className="text-sm text-muted-foreground">
                · Válida hasta {formatDateDisplay(quote.valid_until)}
              </span>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Partidas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2">Descripción</th>
                <th className="text-right px-3 py-2">Cant.</th>
                <th className="text-right px-3 py-2">P. Unit.</th>
                <th className="text-right px-3 py-2">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className={idx % 2 ? "bg-muted/20" : ""}>
                  <td className="px-3 py-2">{it.description ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.quantity ?? 1}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(it.unit_price ?? 0))}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatCurrency(Number(it.amount ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t p-4 space-y-1 text-sm">
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(Number(quote.subtotal))}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-muted-foreground">IVA ({quote.tax_rate}%)</span>
              <span className="font-mono">{formatCurrency(Number(quote.tax_amount))}</span>
            </div>
            <div className="flex justify-end gap-8 font-bold text-base">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(Number(quote.total))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {wasAccepted && (
        <Card className="border-status-available/40 bg-status-available/5">
          <CardContent className="pt-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-status-available mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Cotización aceptada</p>
              <p className="text-muted-foreground">
                {quote.accepted_at ? `El ${formatDateDisplay(quote.accepted_at)}.` : ""} Nuestro equipo te contactará para programar la entrega.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {canAct && (
        <Card>
          <CardHeader><CardTitle className="text-base">Aceptar cotización</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!rejectingMode ? (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
                  <span>He leído y acepto los términos comerciales y condiciones de renta.</span>
                </label>
                <div className="flex gap-2">
                  <Button
                    disabled={!agreed || accept.isPending}
                    onClick={() => accept.mutate(quote.id)}
                  >
                    Aceptar cotización
                  </Button>
                  <Button variant="outline" onClick={() => setRejectingMode(true)}>
                    Rechazar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo del rechazo"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={!reason.trim() || reject.isPending}
                    onClick={() => reject.mutate({ quoteId: quote.id, reason: reason.trim() })}
                  >
                    Confirmar rechazo
                  </Button>
                  <Button variant="outline" onClick={() => setRejectingMode(false)}>Cancelar</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
