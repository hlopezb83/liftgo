import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface PortalQuoteActionCardProps {
  quoteId: string;
  onAccept: (id: string) => void;
  onReject: (payload: { quoteId: string; reason: string }) => void;
  acceptPending: boolean;
  rejectPending: boolean;
}

/**
 * Extraído de PortalQuoteDetail.tsx (v7.226.3) para bajar la complejidad
 * ciclomática de la página bajo el límite de 15 sin duplicar lógica.
 */
export function PortalQuoteActionCard({
  quoteId,
  onAccept,
  onReject,
  acceptPending,
  rejectPending,
}: PortalQuoteActionCardProps) {
  const [agreed, setAgreed] = useState(false);
  const [rejectingMode, setRejectingMode] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Aceptar cotización</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {rejectingMode ? (
          <>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo del rechazo"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={!reason.trim() || rejectPending}
                onClick={() => onReject({ quoteId, reason: reason.trim() })}
              >
                Confirmar rechazo
              </Button>
              <Button variant="outline" onClick={() => setRejectingMode(false)}>Cancelar</Button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="portal-quote-terms" className="flex items-start gap-2 text-sm">
              <Checkbox id="portal-quote-terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
              <span>He leído y acepto los términos comerciales y condiciones de renta.</span>
            </label>
            <div className="flex gap-2">
              <Button
                disabled={!agreed || acceptPending}
                onClick={() => onAccept(quoteId)}
              >
                Aceptar cotización
              </Button>
              <Button variant="outline" onClick={() => setRejectingMode(true)}>
                Rechazar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
