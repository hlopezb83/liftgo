import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { quoteStatusLabel } from "../../constants";
import { useUpdateQuote, useDeleteQuote } from "../quotes/useQuotes";
import { useQuoteBookingCreator, type Assignment } from "./useQuoteBookingCreator";
import { isPublicoGeneral } from "./useQuoteDetailData";
import type { useQuoteConversionState } from "./useQuoteConversionState";
import type { useQuoteDetailData } from "./useQuoteDetailData";

type DataResult = ReturnType<typeof useQuoteDetailData>;
type StateResult = ReturnType<typeof useQuoteConversionState>;

/**
 * Orquesta el flujo UI de conversión de cotización a reserva:
 * reasignación de cliente, decisión de recurrencia y delegación
 * de la creación de bookings a useQuoteBookingCreator.
 */
export function useQuoteConversionActions(id: string | undefined, data: DataResult, state: StateResult) {
  const navigate = useNavigateTransition();
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const { createBookingsFor, convertLegacy } = useQuoteBookingCreator(data, state);
  const { quote, isModelBasedQuote, durationDays } = data;

  const setStatus = async (status: string) => {
    if (!id) return;
    // R8 Bloque 2: al aceptar internamente (sin pasar por RPC del portal), poblar
    // auditoría (`accepted_at` / `accepted_by_user_id`) para trazabilidad. El trigger
    // `guard_quote_acceptance` rechaza aceptar cotizaciones vencidas incluso por PATCH directo.
    const extra: Record<string, string | null> = {};
    if (status === "accepted") {
      const { data: userData } = await import("@/integrations/supabase/client").then((m) => m.supabase.auth.getUser());
      extra.accepted_at = new Date().toISOString();
      extra.accepted_by_user_id = userData.user?.id ?? null;
    }
    updateQuote.mutate(
      { id, status, ...extra },
      { onSuccess: () => notifySuccess(`Cotización marcada como ${quoteStatusLabel(status)}`) },
    );
  };

  const handleDelete = () => {
    if (!id) return;
    deleteQuote.mutate(id, {
      onSuccess: () => { notifySuccess("Cotización eliminada"); navigate("/quotes"); },
      onError: (err: Error) => notifyError({ error: err }),
    });
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

  const proceedWithConversion = () => {
    if (durationDays >= 30) {
      state.setShowRecurringDialog(true);
      return;
    }
    if (isModelBasedQuote) {
      state.setPendingRecurring(false);
      state.setShowAssignmentDialog(true);
    } else {
      void convertLegacy(false);
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
    notifySuccess("Cliente actualizado");
    proceedWithConversion();
  };

  const handleRecurringChoice = (recurring: boolean) => {
    state.setShowRecurringDialog(false);
    state.setPendingRecurring(recurring);
    if (isModelBasedQuote) {
      state.setShowAssignmentDialog(true);
    } else {
      void convertLegacy(recurring);
    }
  };

  const handleAssignmentConfirm = (assignments: Assignment[]) =>
    createBookingsFor(assignments, state.pendingRecurring);

  return {
    setStatus, handleDelete, handleConvertClick, handleReassignConfirm,
    handleRecurringChoice, handleAssignmentConfirm, handleDeliveryNext,
  };
}
