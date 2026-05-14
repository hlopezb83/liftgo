import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateQuote, useDeleteQuote } from "@/hooks/useQuotes";
import { useCreateBooking } from "@/hooks/useBookings";
import type { LineItem } from "@/lib/invoiceUtils";
import { parseLineItems } from "@/lib/lineItems";
import type { useQuoteDetailData } from "./useQuoteDetailData";
import type { useQuoteConversionState, DeliveryInfo } from "./useQuoteConversionState";
import { isPublicoGeneral } from "./useQuoteDetailData";

type DataResult = ReturnType<typeof useQuoteDetailData>;
type StateResult = ReturnType<typeof useQuoteConversionState>;

export function useQuoteConversionActions(id: string | undefined, data: DataResult, state: StateResult) {
  const navigate = useNavigate();
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const createBooking = useCreateBooking();
  const {
    quote, customers, forklifts, isModelBasedQuote, durationDays,
  } = data;

  const setStatus = (status: string) => {
    if (!id) return;
    updateQuote.mutate({ id, status }, { onSuccess: () => toast.success(`Cotización marcada como ${status}`) });
  };

  const handleDeliveryNext = () => {
    if (state.currentDeliveryIndex < state.pendingDeliveries.length - 1) {
      state.setCurrentDeliveryIndex((prev) => prev + 1);
    } else {
      state.setPendingDeliveries([]);
      state.setCurrentDeliveryIndex(0);
      navigate("/calendar");
    }
  };

  const handleDelete = () => {
    if (!id) return;
    deleteQuote.mutate(id, {
      onSuccess: () => { toast.success("Cotización eliminada"); navigate("/quotes"); },
      onError: (err: Error) => toast.error(err.message),
    });
  };

  const proceedWithConversion = () => {
    if (durationDays >= 30) {
      state.setShowRecurringDialog(true);
      return;
    }
    if (isModelBasedQuote) {
      state.setPendingRecurring(false);
      state.setShowAssignmentDialog(true);
    } else {
      void convertToBookingLegacy(false);
    }
  };

  const handleConvertClick = () => {
    if (isPublicoGeneral(quote?.customer_name)) {
      state.setReassignCustomerId("");
      state.setReassignCustomerName("");
      state.setShowCustomerReassignDialog(true);
    } else {
      proceedWithConversion();
    }
  };

  const handleReassignConfirm = async () => {
    if (!quote || !state.reassignCustomerId) return;
    await updateQuote.mutateAsync({
      id: quote.id,
      customer_id: state.reassignCustomerId,
      customer_name: state.reassignCustomerName,
    });
    state.setShowCustomerReassignDialog(false);
    toast.success("Cliente actualizado");
    proceedWithConversion();
  };

  const handleRecurringChoice = (recurring: boolean) => {
    state.setShowRecurringDialog(false);
    state.setPendingRecurring(recurring);
    if (isModelBasedQuote) {
      state.setShowAssignmentDialog(true);
    } else {
      void convertToBookingLegacy(recurring);
    }
  };

  const createDeliveryInfos = (forkliftIds: string[], createdBookingIds: string[]): DeliveryInfo[] => {
    const cust = customers?.find((c) => c.id === quote?.customer_id);
    return forkliftIds.map((fId, i) => {
      const fl = forklifts?.find((f) => f.id === fId);
      return {
        bookingId: createdBookingIds[i],
        forkliftId: fId,
        forkliftName: fl?.name || "Montacargas",
        startDate: quote?.start_date ?? "",
        customerAddress: cust?.address || null,
      };
    });
  };

  const createBookingsFor = async (
    assignments: { forkliftId: string; dailyRate: number; weeklyRate: number; monthlyRate: number }[],
    recurring: boolean,
  ) => {
    if (!quote) return;
    state.setIsConverting(true);
    try {
      // 1) Aplicar tarifas pactadas en paralelo (cada equipo puede tener tarifas distintas).
      const rateUpdates = assignments
        .map((a) => {
          const rateUpdate: Record<string, number> = {};
          if (a.dailyRate > 0) rateUpdate.daily_rate = a.dailyRate;
          if (a.weeklyRate > 0) rateUpdate.weekly_rate = a.weeklyRate;
          if (a.monthlyRate > 0) rateUpdate.monthly_rate = a.monthlyRate;
          return { forkliftId: a.forkliftId, rateUpdate };
        })
        .filter((u) => Object.keys(u.rateUpdate).length > 0);

      const rateResults = await Promise.all(
        rateUpdates.map((u) =>
          supabase.from("forklifts").update(u.rateUpdate).eq("id", u.forkliftId),
        ),
      );
      const ratesApplied = rateResults.filter((r) => !r.error).length;

      // 2) Crear todas las reservas en paralelo (independientes entre sí).
      const createdBookingIds: string[] = await Promise.all(
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

      // 3) Asociar todas las reservas a la cotización en una sola llamada.
      if (createdBookingIds.length > 0) {
        await supabase
          .from("bookings")
          .update({ quote_id: quote.id })
          .in("id", createdBookingIds);
      }
      updateQuote.mutate({ id: quote.id, status: "accepted" });
      toast.success(`${createdBookingIds.length} reserva(s) creada(s) desde cotización`);
      if (ratesApplied > 0) {
        toast.success(`Tarifas actualizadas en ${ratesApplied} equipo(s) según la cotización`);
      }
      state.setShowAssignmentDialog(false);
      state.setCurrentDeliveryIndex(0);
      state.setPendingDeliveries(createDeliveryInfos(assignments.map((a) => a.forkliftId), createdBookingIds));
    } catch (err: unknown) {
      toast.error(`Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      state.setIsConverting(false);
    }
  };

  const handleAssignmentConfirm = (assignments: { forkliftId: string; dailyRate: number; weeklyRate: number; monthlyRate: number }[]) => {
    if (!forklifts) return;
    return createBookingsFor(assignments, state.pendingRecurring);
  };

  const convertToBookingLegacy = async (recurringBilling: boolean) => {
    if (!quote || !forklifts) return;
    const items = parseLineItems<LineItem>(quote.line_items);
    const forkliftIds: string[] = [];
    for (const item of items) {
      const matched = forklifts.find((f) => item.description?.includes(f.name));
      if (matched && !forkliftIds.includes(matched.id)) forkliftIds.push(matched.id);
    }
    if (forkliftIds.length === 0 && quote.forklift_id) forkliftIds.push(quote.forklift_id);
    if (forkliftIds.length === 0) {
      toast.error("No se encontraron montacargas para crear reservas");
      return;
    }
    // En el flujo legacy no tenemos tarifas por línea: se preservan las tarifas actuales del equipo.
    const assignments = forkliftIds.map((fId) => ({ forkliftId: fId, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }));
    await createBookingsFor(assignments, recurringBilling);
  };

  return {
    setStatus, handleDelete, handleConvertClick, handleReassignConfirm,
    handleRecurringChoice, handleAssignmentConfirm, handleDeliveryNext,
  };
}
