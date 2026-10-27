import { Button } from "@/components/ui/button";

interface Props {
  chargeBlock: string | null;
  bookingAvailabilityBlock: string | null;
  isLoading: boolean;
  onRetry: () => void;
}

export function InvoiceAvailabilityNotice({ chargeBlock, bookingAvailabilityBlock, isLoading, onRetry }: Props) {
  const message = chargeBlock || bookingAvailabilityBlock;
  if (!message) return null;

  return (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
      <p>{message}</p>
      <p className="text-sm text-muted-foreground">Los borradores también reservan cargos. Si hay partidas históricas sin vínculo, concílialas antes de continuar.</p>
      <Button type="button" variant="outline" size="sm" disabled={isLoading}
        onClick={() => void onRetry()}>Reintentar consulta</Button>
    </div>
  );
}
