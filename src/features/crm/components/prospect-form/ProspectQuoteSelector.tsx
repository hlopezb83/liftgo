import { DocumentIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatQuoteTotal } from "@/features/quotes";

interface QuoteLite {
  id: string;
  quote_number: string;
  customer_name: string | null;
  total: number;
  currency?: string | null;
  status: string;
}

interface QuoteSelectionControls {
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  linkedError: string | null;
  onRetryLinked: () => void;
}

interface Props {
  quoteId: string | null;
  onChange: (value: string) => void;
  matchingQuotes: QuoteLite[];
  selectedQuote: QuoteLite | null;
  controls?: QuoteSelectionControls;
}

export function ProspectQuoteSelector({ quoteId, onChange, matchingQuotes, selectedQuote, controls }: Props) {
  const options = selectedQuote && !matchingQuotes.some((quote) => quote.id === selectedQuote.id)
    ? [selectedQuote, ...matchingQuotes] : matchingQuotes;
  const missingQuoteId = quoteId && !options.some((quote) => quote.id === quoteId) ? quoteId : null;
  return (
    <div className="space-y-2">
      <Label htmlFor="quote">Cotización Vinculada</Label>
      {controls && (
        <div className="space-y-1">
          <Label htmlFor="quote-search" className="text-xs">Buscar cotización por folio o cliente</Label>
          <Input id="quote-search" value={controls.search} maxLength={200} onChange={(event) => controls.onSearchChange(event.target.value)} />
        </div>
      )}
      <Select value={quoteId ?? "none"} onValueChange={onChange}>
        <SelectTrigger id="quote">
          <SelectValue placeholder="Seleccionar cotización…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin cotización</SelectItem>
          {missingQuoteId && <SelectItem value={missingQuoteId} disabled>Cotización vinculada</SelectItem>}
          {options.map((q) => (
            <SelectItem key={q.id} value={q.id}>
              <span className="flex items-center gap-2">
                <DocumentIcon className="h-3.5 w-3.5" />
                {q.quote_number} — {q.customer_name} — {formatQuoteTotal(q)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {controls && <QuoteSelectionStatus controls={controls} empty={matchingQuotes.length === 0} />}
      {selectedQuote && (
        <p className="text-xs text-muted-foreground">
          Cotización por {formatQuoteTotal(selectedQuote)} — Estado: {selectedQuote.status}
        </p>
      )}
    </div>
  );
}

function QuoteSelectionStatus({ controls, empty }: { controls: QuoteSelectionControls; empty: boolean }) {
  return (
    <div className="space-y-1 text-xs">
      {controls.isLoading && <p role="status">Cargando cotizaciones…</p>}
      {controls.isError && <p role="alert">No se pudieron cargar las cotizaciones. <button type="button" className="underline" onClick={controls.onRetry}>Reintentar búsqueda</button></p>}
      {!controls.isLoading && !controls.isError && empty && <p>Sin resultados para esta búsqueda.</p>}
      {controls.hasMore && <Button type="button" variant="outline" size="sm" disabled={controls.isLoading} onClick={controls.onLoadMore}>Cargar más cotizaciones</Button>}
      {controls.linkedError && <p role="status">{controls.linkedError} <button type="button" className="underline" onClick={controls.onRetryLinked}>Verificar de nuevo</button></p>}
    </div>
  );
}
