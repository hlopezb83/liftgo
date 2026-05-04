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

  const createBookingsFor = async (forkliftIds: string[], recurring: boolean) => {
    if (!quote) return;
    state.setIsConverting(true);
    try {
      const createdBookingIds: string[] = [];
      for (const fId of forkliftIds) {
        const bookingId = await createBooking.mutateAsync({
          forklift_id: fId,
          start_date: quote.start_date ?? "",
          end_date: quote.end_date ?? "",
          customer_name: quote.customer_name,
          customer_id: quote.customer_id,
          status: "confirmed",
          recurring_billing: recurring,
        });
        await supabase.from("bookings").update({ quote_id: quote.id }).eq("id", bookingId);
        createdBookingIds.push(bookingId);
      }
      updateQuote.mutate({ id: quote.id, status: "accepted" });
      toast.success(`${createdBookingIds.length} reserva(s) creada(s) desde cotización`);
      state.setShowAssignmentDialog(false);
      state.setCurrentDeliveryIndex(0);
      state.setPendingDeliveries(createDeliveryInfos(forkliftIds, createdBookingIds));
    } catch (err: unknown) {
      toast.error(`Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      state.setIsConverting(false);
    }
  };

  const handleAssignmentConfirm = (forkliftIds: string[]) => {
    if (!forklifts) return;
    return createBookingsFor(forkliftIds, state.pendingRecurring);
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
    await createBookingsFor(forkliftIds, recurringBilling);
  };

  return {
    setStatus, handleDelete, handleConvertClick, handleReassignConfirm,
    handleRecurringChoice, handleAssignmentConfirm, handleDeliveryNext,
  };
}
