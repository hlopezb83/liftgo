import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCreateBooking } from "@/features/bookings/hooks/useBookings";
import { useUpdateQuote } from "@/features/quotes/hooks/quotes/useQuotes";
import { parseLineItems } from "@/lib/lineItems";
import type { LineItem } from "@/lib/domain/invoiceUtils";
import type { useQuoteDetailData } from "./useQuoteDetailData";
import type { useQuoteConversionState, DeliveryInfo } from "./useQuoteConversionState";

export type Assignment = {
  forkliftId: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
};

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

  const buildDeliveryInfos = (forkliftIds: string[], bookingIds: string[]): DeliveryInfo[] => {
    const cust = customers?.find((c) => c.id === quote?.customer_id);
    return forkliftIds.map((fId, i) => {
      const fl = forklifts?.find((f) => f.id === fId);
      return {
        bookingId: bookingIds[i],
        forkliftId: fId,
        forkliftName: fl?.name || "Montacargas",
        startDate: quote?.start_date ?? "",
        customerAddress: cust?.address || null,
      };
    });
  };

  const applyRates = async (assignments: Assignment[]) => {
    const updates = assignments
      .map((a) => {
        const u: Record<string, number> = {};
        if (a.dailyRate > 0) u.daily_rate = a.dailyRate;
        if (a.weeklyRate > 0) u.weekly_rate = a.weeklyRate;
        if (a.monthlyRate > 0) u.monthly_rate = a.monthlyRate;
        return { forkliftId: a.forkliftId, payload: u };
      })
      .filter((u) => Object.keys(u.payload).length > 0);

    const results = await Promise.all(
      updates.map((u) => supabase.from("forklifts").update(u.payload).eq("id", u.forkliftId)),
    );
    return results.filter((r) => !r.error).length;
  };

  const createBookingsFor = async (assignments: Assignment[], recurring: boolean) => {
    if (!quote) return;
    state.setIsConverting(true);
    try {
      const ratesApplied = await applyRates(assignments);

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
        await supabase.from("bookings").update({ quote_id: quote.id }).in("id", bookingIds);
      }
      updateQuote.mutate({ id: quote.id, status: "accepted" });
      toast.success(`${bookingIds.length} reserva(s) creada(s) desde cotización`);
      if (ratesApplied > 0) {
        toast.success(`Tarifas actualizadas en ${ratesApplied} equipo(s) según la cotización`);
      }
      state.setShowAssignmentDialog(false);
      state.setCurrentDeliveryIndex(0);
      state.setPendingDeliveries(
        buildDeliveryInfos(assignments.map((a) => a.forkliftId), bookingIds),
      );
    } catch (err: unknown) {
      toast.error(`Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      state.setIsConverting(false);
    }
  };

  const convertLegacy = async (recurring: boolean) => {
    if (!quote || !forklifts) return;
    const items = parseLineItems<LineItem>(quote.line_items);
    const ids: string[] = [];
    for (const item of items) {
      const matched = forklifts.find((f) => item.description?.includes(f.name));
      if (matched && !ids.includes(matched.id)) ids.push(matched.id);
    }
    if (ids.length === 0 && quote.forklift_id) ids.push(quote.forklift_id);
    if (ids.length === 0) {
      toast.error("No se encontraron montacargas para crear reservas");
      return;
    }
    const assignments = ids.map((fId) => ({ forkliftId: fId, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }));
    await createBookingsFor(assignments, recurring);
  };

  return { createBookingsFor, convertLegacy };
}
