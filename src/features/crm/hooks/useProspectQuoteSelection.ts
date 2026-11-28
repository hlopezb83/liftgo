import { useCrmQuote, useCrmQuoteOptions } from "@/features/quotes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { sortQuotesByCompanyMatch } from "../lib/prospectFormSchema";

interface UseProspectQuoteSelectionParams {
  quoteId: string | null;
  company: string;
  quoteSearch: string;
  open: boolean;
  onSearchChange: (search: string) => void;
}

export function useProspectQuoteSelection({
  quoteId,
  company,
  quoteSearch,
  open,
  onSearchChange,
}: UseProspectQuoteSelectionParams) {
  const debouncedQuoteSearch = useDebouncedValue(quoteSearch);
  const quoteOptions = useCrmQuoteOptions(debouncedQuoteSearch, open);
  const linkedQuoteQuery = useCrmQuote(quoteId, open);
  const selectedQuote = quoteId && linkedQuoteQuery.data?.id === quoteId ? linkedQuoteQuery.data : null;
  const allQuotes = [...new Map((quoteOptions.data?.pages.flat() ?? []).map((quote) => [quote.id, quote])).values()];
  const matchingQuotes = sortQuotesByCompanyMatch(
    selectedQuote && !allQuotes.some((quote) => quote.id === selectedQuote.id)
      ? [selectedQuote, ...allQuotes]
      : allQuotes,
    company,
  );

  const linkedQuoteError = !quoteId
    ? null
    : linkedQuoteQuery.isError
      ? "No se pudo verificar la cotización vinculada. Reintenta antes de guardar."
      : linkedQuoteQuery.isPending || linkedQuoteQuery.isFetching
        ? "Espera a que se verifique la cotización vinculada."
        : !selectedQuote
          ? "La cotización vinculada no está disponible. Reintenta o desvincúlala explícitamente."
          : null;

  return {
    selectedQuote,
    matchingQuotes,
    linkedQuoteError,
    quoteSelection: {
      search: quoteSearch,
      onSearchChange,
      isLoading: quoteOptions.isFetching,
      isError: quoteOptions.isError,
      hasMore: !!quoteOptions.hasNextPage,
      onLoadMore: () => { void quoteOptions.fetchNextPage(); },
      onRetry: () => { void quoteOptions.refetch(); },
      linkedError: linkedQuoteError,
      onRetryLinked: () => { void linkedQuoteQuery.refetch(); },
    },
  };
}
