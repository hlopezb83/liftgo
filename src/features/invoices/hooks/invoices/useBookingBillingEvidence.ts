import { useQuery } from "@tanstack/react-query";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { isE2eDataVisible } from "@/lib/supabase/constants";
import { readInvoiceBookingBillingEvidence } from "../../lib/invoiceBookingReadRpc";
import { invoiceKeys } from "../../lib/queryKeys";
import type { ReturnBillingEvidence } from "../../lib/completedRecurringBooking";
import type { BillingExtension, BookingInvoiceClaim } from "../../lib/originalBookingPeriod";

const PAGE_SIZE = 1000;

/** A partial read must never reopen an already billed period. */
export async function readAllBillingPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 100; page++) {
    signal?.throwIfAborted();
    const { data, error } = await read(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    // Also reject when a transport resolves after cancellation. Never expose a
    // partial history or start another page after the form's query is abandoned.
    signal?.throwIfAborted();
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("No se pudo verificar el historial completo de facturación. Recarga y reintenta.");
}

interface BillingEvidence {
  claims: BookingInvoiceClaim[];
  extensions: BillingExtension[];
  returns: ReturnBillingEvidence[];
}

const emptyEvidence: BillingEvidence = { claims: [], extensions: [], returns: [] };

export function useBookingBillingEvidence(bookingIds: readonly string[]) {
  const organizationId = useVerifiedOrganizationId();
  const identity = useVerifiedIdentityScope();
  const scope = { organizationId, identity, bookingIds: [...new Set(bookingIds)].sort(), includeE2e: isE2eDataVisible() };
  const { data, isError, isSuccess, isFetching, refetch } = useQuery<BillingEvidence>({
    queryKey: [...invoiceKeys.lists(), "booking-billing-evidence", scope],
    enabled: (!!organizationId && !!identity) || scope.bookingIds.length === 0,
    staleTime: 0,
    queryFn: ({ signal }) => {
      if (!scope.bookingIds.length) return Promise.resolve(emptyEvidence);
      if (!organizationId || !identity) throw new Error("Empresa no verificada");
      return readInvoiceBookingBillingEvidence({
        p_expected_organization_id: organizationId,
        p_booking_ids: scope.bookingIds,
        p_include_e2e: scope.includeE2e,
      }, signal);
    },
  });
  const state = { isError, isSuccess, isFetching, refetch };
  return {
    claims: { ...state, data: data?.claims },
    extensions: { ...state, data: data?.extensions },
    returns: { ...state, data: data?.returns },
  };
}
