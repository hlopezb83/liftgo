import { FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatCurrency";

interface QuoteLite {
  id: string;
  quote_number: string;
  customer_name: string | null;
  total: number;
  status: string;
}

interface Props {
  quoteId: string | null;
  onChange: (value: string) => void;
  matchingQuotes: QuoteLite[];
  selectedQuote: QuoteLite | null;
}

export function ProspectQuoteSelector({ quoteId, onChange, matchingQuotes, selectedQuote }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="quote">Cotización Vinculada</Label>
      <Select value={quoteId ?? "none"} onValueChange={onChange}>
        <SelectTrigger id="quote">
          <SelectValue placeholder="Seleccionar cotización..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin cotización</SelectItem>
          {matchingQuotes.map((q) => (
            <SelectItem key={q.id} value={q.id}>
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                {q.quote_number} — {q.customer_name} — {formatCurrency(q.total)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedQuote && (
        <p className="text-xs text-muted-foreground">
          Cotización por {formatCurrency(selectedQuote.total)} — Estado: {selectedQuote.status}
        </p>
      )}
    </div>
  );
}
