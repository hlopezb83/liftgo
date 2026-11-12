import { useQueryClient } from "@tanstack/react-query";
import { customerQueries, useCustomer } from "@/features/customers";
import type { Customer } from "./invoiceFormBuilders";

interface Source {
  quoteId?: string;
  quote?: { id: string; customer_id?: string | null } | null;
  isEdit: boolean;
  extensionId: string | null;
  damageId: string | null;
  customers: Customer[] | undefined;
}

function quoteCustomerId({ quoteId, quote, isEdit, extensionId, damageId }: Source) {
  return !isEdit && !extensionId && !damageId && quote?.id === quoteId
    ? quote?.customer_id ?? undefined : undefined;
}

/** Source documents need their exact receiver, independently of the selector's first page. */
export function useInvoiceSourceCustomer(source: Source) {
  const customerId = quoteCustomerId(source);
  const client = useQueryClient();
  const query = useCustomer(customerId);
  const customer = query.data?.id === customerId ? query.data : undefined;
  return {
    prefillCustomers: source.isEdit ? source.customers : customerId ? customer ? [customer] : undefined : [],
    dependencies: customerId ? [{
      isError: query.isError || (query.isSuccess && !customer), refetch: query.refetch,
    }] : [],
    isLoading: !!customerId && (query.isPending || query.isFetching || query.fetchStatus === "paused"),
    loadForId: async (id: string) => {
      const options = customerQueries.detail(id);
      const receiver = await client.fetchQuery(options);
      if (!receiver || receiver.id !== id) {
        await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
        throw new Error("No se pudo verificar el cliente de la reserva. Reintenta la consulta.");
      }
      return receiver;
    },
  };
}
