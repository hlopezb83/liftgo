import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";
import { useCreateBooking } from "@/features/bookings";
import { useUpdateQuote } from "../quotes/useQuotes";
import type { useQuoteDetailData } from "./useQuoteDetailData";
import type { useQuoteConversionState } from "./useQuoteConversionState";
import {
  applyRatesToForklifts,
  buildDeliveryInfos,
  resolveLegacyForkliftIds,
  type Assignment,
} from "./quoteBookingBuilders";

export type { Assignment } from "./quoteBookingBuilders";

type DataResult = ReturnType<typeof useQuoteDetailData>;
type StateResult = ReturnType<typeof useQuoteConversionState>;

/**
 * Encapsula la creación atómica de reservas a partir de una cotización:
 * actualiza tarifas, crea bookings en paralelo, los vincula a la cotización
 * y prepara la lista de entregas pendientes para el flujo post-conversión.
 */
export function useQuoteBookingCreator(data: DataResult, state: StateResult) {
  const updateQuote = useUpdateQuote();
  const createBooking = useCreateBooking();
  const { quote, customers, forklifts } = data;

  const createBookingsFor = async (assignments: Assignment[], recurring: boolean) => {
    if (!quote) return;
    state.setIsConverting(true);
    try {
      const ratesApplied = await applyRatesToForklifts(assignments);

      const bookingIds: string[] = await Promise.all(
        assignments.map((a) =>
          createBooking.mutateAsync({
            forklift_id: a.forkliftId,
            start_date: quote.start_date ?? "",
            end_date: quote.end_date ?? "",
            customer_name: quote.customer_name,
            customer_id: quote.customer_id,
            status: "confirmed",
            recurring_billing: recurring,
          }),
        ),
      );

      if (bookingIds.length > 0) {
        const { data: linked, error: linkErr } = await supabase
          .from("bookings")
          .update({ quote_id: quote.id })
          .in("id", bookingIds)
          .select("id");
        if (linkErr) throw linkErr;
        assertRowsAffected(linked, "Vincular reservas a cotización");
      }
      updateQuote.mutate({ id: quote.id, status: "accepted" });
      toast.success(`${bookingIds.length} reserva(s) creada(s) desde cotización`);
      if (ratesApplied > 0) {
        toast.success(`Tarifas actualizadas en ${ratesApplied} equipo(s) según la cotización`);
      }
      state.setShowAssignmentDialog(false);
      state.setCurrentDeliveryIndex(0);
      state.setPendingDeliveries(
        buildDeliveryInfos(quote, customers, forklifts, assignments.map((a) => a.forkliftId), bookingIds),
      );
    } catch (err: unknown) {
      notifyError({ message: `Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}` });
    } finally {
      state.setIsConverting(false);
    }
  };

  const convertLegacy = async (recurring: boolean) => {
    if (!quote || !forklifts) return;
    const ids = resolveLegacyForkliftIds(quote, forklifts);
    if (ids.length === 0) {
      notifyError({ message: "No se encontraron montacargas para crear reservas" });
      return;
    }
    const assignments = ids.map((fId) => ({ forkliftId: fId, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }));
    await createBookingsFor(assignments, recurring);
  };

  return { createBookingsFor, convertLegacy };
}
