import { useQueryClient } from "@tanstack/react-query";
import { bookingKeys } from "@/features/bookings";
import { forkliftKeys } from "@/features/fleet";
import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { quoteKeys } from "../quotes/useQuotes";
import {
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
 * BL-32 (v7.94.0): usa la RPC transaccional `convert_quote_to_bookings`. Si
 * alguna reserva falla, la transacción se revierte completa en el servidor.
 * El cliente ya no ejecuta rollback best-effort.
 */
export function useQuoteBookingCreator(data: DataResult, state: StateResult) {
  const queryClient = useQueryClient();
  const { quote, customers, forklifts } = data;

  const createBookingsFor = async (assignments: Assignment[], recurring: boolean) => {
    if (!quote) return;
    state.setIsConverting(true);
    try {
      const { data: rows, error } = await supabase.rpc("convert_quote_to_bookings", {
        p_quote_id: quote.id,
        p_assignments: assignments.map((a) => ({
          forklift_id: a.forkliftId,
          daily_rate: a.dailyRate ?? 0,
          weekly_rate: a.weeklyRate ?? 0,
          monthly_rate: a.monthlyRate ?? 0,
        })),
        p_recurring: recurring,
      });

      if (error) throw error;

      const createdIds = (rows ?? []).map((r) => r.booking_id as string);
      const forkliftIds = (rows ?? []).map((r) => r.forklift_id as string);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
        queryClient.invalidateQueries({ queryKey: forkliftKeys.all }),
        queryClient.invalidateQueries({ queryKey: quoteKeys.all }),
      ]);

      notifySuccess(`${createdIds.length} reserva(s) creada(s) desde cotización`);
      state.setShowAssignmentDialog(false);
      state.setCurrentDeliveryIndex(0);
      state.setPendingDeliveries(
        buildDeliveryInfos(quote, customers, forklifts, forkliftIds, createdIds),
      );
    } catch (err: unknown) {
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
