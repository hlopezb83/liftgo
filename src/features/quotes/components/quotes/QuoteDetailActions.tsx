
import { useState } from "react";
import { EditIcon, DeliveryIcon, SuccessIcon, ErrorIcon, BookOpen, DeleteIcon, InvoiceIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { Tables } from "@/integrations/supabase/types";
import { RoleGuard } from "@/layouts/RoleGuard";
import { toYMD } from "@/lib/date/toYMD";
import { isQuoteEditable, canConvertQuote } from "@/lib/rules/quotes";
import { parseDateLocal } from "@/lib/utils";
import { QuotePDFButton } from "./QuotePDFButton";

interface Props {
  quote: Tables<"quotes">;
  isSale: boolean;
  alreadyConverted: boolean;
  alreadyInvoiced: boolean;
  isConverting: boolean;
  canInvoice: boolean;
  invoiceBlockedReason?: string;
  onSetStatus: (status: string) => void;
  onConvertClick: () => void;
  onDelete: () => void;
}

function ConvertButton({ quote, isSale, alreadyConverted, isConverting, onConvertClick }: {
  quote: Tables<"quotes">; isSale: boolean; alreadyConverted: boolean; isConverting: boolean; onConvertClick: () => void;
}) {
  const canConvert = canConvertQuote(quote, { isSale, alreadyConverted });
  if (alreadyConverted) {
    return (
      <Button size="sm" variant="outline" disabled className="opacity-70">
        <BookOpen className="h-4 w-4 mr-1" />Ya convertida a Reserva
      </Button>
    );
  }
  if (!canConvert) return null;
  return (
    <Button size="sm" variant="default" onClick={onConvertClick} disabled={isConverting}>
      <BookOpen className="h-4 w-4 mr-1" />{isConverting ? "Creando reservas..." : "Convertir a Reserva"}
    </Button>
  );
}

function InvoiceButton({ quote, isSale, alreadyInvoiced, canInvoice, invoiceBlockedReason }: {
  quote: Tables<"quotes">; isSale: boolean; alreadyInvoiced: boolean; canInvoice: boolean; invoiceBlockedReason?: string;
}) {
  const navigate = useNavigateTransition();
  if (!isSale) return null;
  if (alreadyInvoiced) {
    return (
      <Button size="sm" variant="outline" disabled className="opacity-70">
        <InvoiceIcon className="h-4 w-4 mr-1" />Ya facturada
      </Button>
    );
  }
  if (quote.status !== "accepted") return null;
  if (canInvoice) {
    return (
      <Button size="sm" variant="default" onClick={() => navigate(`/invoices/new?from_quote=${quote.id}`)}>
        <InvoiceIcon className="h-4 w-4 mr-1" />Facturar
      </Button>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="default" disabled className="pointer-events-none opacity-60">
              <InvoiceIcon className="h-4 w-4 mr-1" />Facturar
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{invoiceBlockedReason ?? "Asigna los equipos antes de facturar"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DeleteDialog({ quoteNumber, onDelete }: { quoteNumber: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <RoleGuard module="Cotizaciones" minAccess="full" fallback={null}>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        <DeleteIcon className="h-4 w-4 mr-1" />Eliminar
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Eliminar cotización?"
        description={`Esta acción no se puede deshacer. Se eliminará permanentemente la cotización ${quoteNumber}.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={onDelete}
      />
    </RoleGuard>
  );
}

export function QuoteDetailActions({
  quote, isSale, alreadyConverted, alreadyInvoiced, isConverting,
  canInvoice, invoiceBlockedReason,
  onSetStatus, onConvertClick, onDelete,
}: Props) {
  const navigate = useNavigateTransition();
  const isEditable = isQuoteEditable(quote);
  return (
    <>
      <QuotePDFButton quoteId={quote.id} />
      {isEditable && (
        <Button variant="outline" size="sm" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>
          <EditIcon className="h-4 w-4 mr-1" />Editar
        </Button>
      )}
      {quote.status === "draft" && (
        <Button size="sm" onClick={() => onSetStatus("sent")}>
          <DeliveryIcon className="h-4 w-4 mr-1" />Marcar Enviada
        </Button>
      )}
      <ConvertButton
        quote={quote} isSale={isSale} alreadyConverted={alreadyConverted}
        isConverting={isConverting} onConvertClick={onConvertClick}
      />
      <InvoiceButton
        quote={quote} isSale={isSale} alreadyInvoiced={alreadyInvoiced}
        canInvoice={canInvoice} invoiceBlockedReason={invoiceBlockedReason}
      />
      {quote.status === "sent" && (() => {
        // R7 Bloque 7: bloquear "Aceptar" si la cotización ya venció.
        const validUntil = quote.valid_until ? parseDateLocal(quote.valid_until) : null;
        const today = parseDateLocal(toYMD(new Date()));
        const isExpired = !!validUntil && !!today && validUntil.getTime() < today.getTime();
        return (
          <>
            {isExpired ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="default" disabled>
                        <SuccessIcon className="h-4 w-4 mr-1" />Aceptar
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Cotización vencida. Actualiza la vigencia para aceptarla.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button size="sm" variant="default" onClick={() => onSetStatus("accepted")}>
                <SuccessIcon className="h-4 w-4 mr-1" />Aceptar
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => onSetStatus("declined")}>
              <ErrorIcon className="h-4 w-4 mr-1" />Rechazar
            </Button>
          </>
        );
      })()}
      <DeleteDialog quoteNumber={quote.quote_number} onDelete={onDelete} />
    </>
  );
}
