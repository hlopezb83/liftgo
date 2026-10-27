import { FormActions } from "@/components/forms/FormActions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

interface QuoteFormFooterProps {
  total: number;
  currency: string;
  isAmountLocked: boolean;
  submitLabel: string;
  isPending: boolean;
  chargeIdentityError: string | null;
  onCancel: () => void;
}

/** One mounted FormActions keeps its synchronous duplicate-submit guard intact. */
export function QuoteFormFooter({ total, currency, isAmountLocked, submitLabel, isPending, chargeIdentityError, onCancel }: QuoteFormFooterProps) {
  return (
    <div role="region" aria-label="Total y acciones de cotización" className="sticky bottom-0 z-20 -mx-4 space-y-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-md backdrop-blur sm:-mx-6 sm:px-6 lg:flex lg:items-center lg:justify-between lg:gap-6 lg:space-y-0">
      <div className="flex items-baseline justify-between gap-3 lg:block">
        <span className="text-sm text-muted-foreground">Total <span className="text-xs">{currency}</span></span>
        <p className="text-lg font-bold tabular-nums">{formatCurrencyWithCode(total, currency)}</p>
      </div>
      {isAmountLocked ? (
        <Alert className="lg:max-w-2xl">
          <AlertDescription>
            Esta cotización ya fue aceptada o convertida a reserva: sus montos no pueden modificarse.
            Para corregirla, un administrador puede cancelarla; si necesitas otra versión, crea una cotización nueva.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="lg:w-96 lg:max-w-full">
          <FormActions
            submitLabel={submitLabel}
            isPending={isPending}
            submitDisabled={!!chargeIdentityError}
            submitDisabledReason={chargeIdentityError ?? undefined}
            onCancel={onCancel}
          />
        </div>
      )}
    </div>
  );
}
