import { useCreateBooking } from "@/features/bookings";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateQuote } from "../quotes/useQuotes";
import {
  applyRatesToBookings,
  buildDeliveryInfos,
  resolveLegacyForkliftIds,
  type Assignment,
} from "./quoteBookingBuilders";
import type { useQuoteConversionState } from "./useQuoteConversionState";
import type { useQuoteDetailData } from "./useQuoteDetailData";

export type { Assignment } from "./quoteBookingBuilders";

type DataResult = ReturnType<typeof useQuoteDetailData>;
type StateResult = ReturnType<typeof useQuoteConversionState>;

/**
 * Encapsula la creación de reservas a partir de una cotización.
 *
 * BL-31/32 (v7.92.0): las tarifas negociadas se guardan en la reserva (no en
 * el montacargas maestro). Si alguna reserva falla, se revierten las creadas
 * en este mismo intento para no dejar cotizaciones a medio convertir.
 */
export function useQuoteBookingCreator(data: DataResult, state: StateResult) {
  const updateQuote = useUpdateQuote();
  const createBooking = useCreateBooking();
  const { quote, customers, forklifts } = data;

  const createBookingsFor = async (assignments: Assignment[], recurring: boolean) => {
    if (!quote) return;
    state.setIsConverting(true);
    const createdIds: string[] = [];
    try {
      for (const a of assignments) {
        const id = await createBooking.mutateAsync({
          forklift_id: a.forkliftId,
          start_date: quote.start_date ?? "",
          end_date: quote.end_date ?? "",
          customer_name: quote.customer_name,
          customer_id: quote.customer_id,
          status: "confirmed",
          recurring_billing: recurring,
          quote_id: quote.id,
        });
        createdIds.push(id as string);
      }

      const ratesApplied = await applyRatesToBookings(
        assignments.map((a, i) => ({ ...a, bookingId: createdIds[i] })),
      );

      updateQuote.mutate({ id: quote.id, status: "accepted" });
      notifySuccess(`${createdIds.length} reserva(s) creada(s) desde cotización`);
      if (ratesApplied > 0) {
        notifySuccess(`Tarifas negociadas aplicadas a ${ratesApplied} reserva(s)`);
      }
      state.setShowAssignmentDialog(false);
      state.setCurrentDeliveryIndex(0);
      state.setPendingDeliveries(
        buildDeliveryInfos(quote, customers, forklifts, assignments.map((a) => a.forkliftId), createdIds),
      );
    } catch (err: unknown) {
      // Rollback best-effort: borrar las reservas ya creadas en este intento.
      if (createdIds.length > 0) {
        await supabase.from("bookings").delete().in("id", createdIds);
      }
      notifyError({
        error: err,
        message: `Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}`,
      });
    } finally {
      state.setIsConverting(false);
    }
  };


  const convertLegacy = async (recurring: boolean) => {
    if (!quote || !forklifts) return;
    const ids = resolveLegacyForkliftIds(quote, forklifts);
    if (ids.length === 0) {
      notifyValidation({ message: "No se encontraron montacargas para crear reservas" });
      return;
    }
    const assignments = ids.map((fId) => ({ forkliftId: fId, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }));
    await createBookingsFor(assignments, recurring);
  };

  return { createBookingsFor, convertLegacy };
}

