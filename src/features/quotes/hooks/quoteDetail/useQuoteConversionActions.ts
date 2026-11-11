import { ROUTES } from "@/app-routes/routes";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { canConvertQuote } from "@/lib/rules/quotes";
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
  const { quote, isModelBasedQuote } = data;

  const setStatus = async (status: string, opts?: { rejectionReason?: string }) => {
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
    // BL-R8-19: persistir el motivo de rechazo (columna ya existente).
    // R9-P2: además sellar `rejected_at` para que historial y reportes sepan CUÁNDO
    // se rechazó (antes quedaba NULL y el rechazo no era trazable en el tiempo).
    if (status === "rejected") {
      // B-9: instante UTC real (nowMty().toISOString() serializaba el reloj
      // MTY con sufijo "Z", desplazando la hora). Mismo patrón que accepted_at.
      extra.rejected_at = new Date().toISOString();
      if (opts?.rejectionReason) extra.rejection_reason = opts.rejectionReason;
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
      const bookingId = state.pendingDeliveries[0]?.bookingId;
      const destination = state.pendingDeliveries.length === 1 && bookingId
        ? ROUTES.bookings.detail(bookingId)
        : ROUTES.bookings.list;
      state.setPendingDeliveries([]);
      state.setCurrentDeliveryIndex(0);
      navigate(destination);
    }
  };

  const canStartConversion = quote && data.bookingLinksStatus === "ready" &&
    canConvertQuote(quote, { isSale: data.isSale, alreadyConverted: data.alreadyConverted });

  const handleConvertClick = () => {
    if (canStartConversion) state.setShowConvertDialog(true);
  };

  /**
   * Paso único de confirmación: reasigna el cliente cuando la cotización está
   * a nombre de "Público en General" y decide la facturación recurrente antes
   * de crear las reservas.
   */
  const handleConvertConfirm = async (payload: {
    recurring: boolean; customerId: string; customerName: string;
  }) => {
    if (!quote || !canStartConversion) return;
    const replacementCustomerId = isPublicoGeneral(quote.customer_name) ? payload.customerId : null;
    if (replacementCustomerId === "") return;
    const request = { quoteId: quote.id, recurring: payload.recurring, replacementCustomerId };
    if (isModelBasedQuote) {
      state.setPendingConversion(request);
      state.setShowConvertDialog(false);
      state.setShowAssignmentDialog(true);
    } else {
      await convertLegacy(request);
    }
  };

  const handleAssignmentConfirm = async (assignments: Assignment[]) => {
    if (canStartConversion && state.pendingConversion) {
      await createBookingsFor(assignments, state.pendingConversion);
    }
  };

  return {
    setStatus, handleDelete, handleConvertClick, handleConvertConfirm,
    handleAssignmentConfirm, handleDeliveryNext,
  };
}
