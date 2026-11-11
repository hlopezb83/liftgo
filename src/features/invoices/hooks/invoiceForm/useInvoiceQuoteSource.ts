import { useInvoicePrefill } from "./useInvoicePrefill";
import type { useInvoiceQuoteCharges } from "./useInvoiceQuoteCharges";

function quotePrefillBlock(quoteId: string | null | undefined, version: number | null, error: string | null, failed: boolean) {
  if (!quoteId || version != null) return null;
  if (error) return error;
  return failed ? "No se pudieron cargar los datos de la cotización. Reintenta la consulta." : "Verificando los datos de la cotización…";
}

export function useInvoiceQuoteSource(
  args: Omit<Parameters<typeof useInvoicePrefill>[0], "hasOtherPrefill" | "chargeAvailability">,
  sources: { extensionId: string | null; damageId: string | null },
  charges: ReturnType<typeof useInvoiceQuoteCharges>["chargeAvailability"],
  dependencies: { isError: boolean; refetch: () => Promise<unknown> }[],
) {
  const { quoteChargePrefillError, sourceQuoteVersion } = useInvoicePrefill({
    ...args,
    hasOtherPrefill: !!(sources.extensionId || sources.damageId),
    chargeAvailability: charges.isError ? undefined : charges.data,
  });
  return {
    sourceQuoteVersion,
    block: quotePrefillBlock(args.requestedQuoteId, sourceQuoteVersion, quoteChargePrefillError, dependencies.some((read) => read.isError)),
    retry: () => Promise.all([...dependencies.map((read) => read.refetch()), charges.refetch()]),
  };
}
