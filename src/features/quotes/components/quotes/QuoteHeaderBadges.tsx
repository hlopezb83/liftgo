import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { STATUS_LABELS } from "@/lib/constants";
import { quoteStatusLabel } from "@/features/quotes/constants";

interface Props {
  status: string;
  quoteType: string;
  isSale: boolean;
  currency?: string;
}

export function QuoteHeaderBadges({ status, quoteType, isSale, currency }: Props) {
  const showCurrency = Boolean(currency && currency !== "MXN");
  return (
    <div className="flex gap-2 items-center">
      <StatusBadge status={status} label={quoteStatusLabel(status)} />
      <Badge variant={isSale ? "default" : "secondary"}>{STATUS_LABELS[quoteType] ?? quoteType}</Badge>
      {showCurrency && <Badge variant="outline">{currency}</Badge>}
    </div>
  );
}
