import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { bookingKeys } from "@/features/bookings";
import { forkliftKeys } from "@/features/fleet";
import { notifyError, notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { quoteKeys } from "../quotes/useQuotes";
import {
  buildDeliveryInfos,
  resolveLegacyForkliftIds,
  type Assignment,
} from "./quoteBookingBuilders";
import { convertQuoteBookings } from "./quoteConversionRpc";
import type { QuoteConversion, useQuoteConversionState } from "./useQuoteConversionState";
import type { useQuoteDetailData } from "./useQuoteDetailData";

export type { Assignment } from "./quoteBookingBuilders";

type DataResult = ReturnType<typeof useQuoteDetailData>;
type StateResult = ReturnType<typeof useQuoteConversionState>;

/**
 * Encapsula la creación de reservas a partir de una cotización.
 *
 * Usa la puerta de organización de la RPC transaccional `convert_quote_to_bookings`. Si
 * alguna reserva falla, la transacción se revierte completa en el servidor.
 * El cliente ya no ejecuta rollback best-effort.
 */
export function useQuoteBookingCreator(data: DataResult, state: StateResult) {
  const queryClient = useQueryClient();
  const { quote, customers, forklifts, equipmentModels } = data;

  const converting = useRef(false);
  const createBookingsFor = async (assignments: Assignment[], request: QuoteConversion) => {
    if (quote?.id !== request.quoteId || converting.current) return;
    converting.current = true;
    state.setIsConverting(true);
    try {
      const rows = await convertQuoteBookings(request.quoteId, assignments, request.recurring, request.replacementCustomerId);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
        queryClient.invalidateQueries({ queryKey: forkliftKeys.all }),
        queryClient.invalidateQueries({ queryKey: quoteKeys.all }),
      ]);

      notifySuccess(`${rows.length} reserva(s) creada(s) desde cotización`);
      state.setShowConvertDialog(false);
      state.setShowAssignmentDialog(false);
      state.setPendingConversion(null);
      state.setCurrentDeliveryIndex(0);
      state.setPendingDeliveries(
        buildDeliveryInfos(rows, customers, forklifts),
      );
    } catch (err: unknown) {
      notifyError({
        error: err,
        message: `Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}`,
      });
    } finally {
      converting.current = false;
      state.setIsConverting(false);
    }
  };

  const convertLegacy = async (request: QuoteConversion) => {
    if (!quote || !forklifts) return;
    const ids = resolveLegacyForkliftIds(quote, forklifts);
    if (ids.length === 0) {
      notifyValidation({ message: "No se encontraron montacargas para crear reservas" });
      return;
    }
    // F5 (Sprint M1): NO enviar tarifas en 0 — la RPC `convert_quote_to_bookings`
    // hacía UPDATE con esos ceros y pisaba las tarifas de la unidad (y un 0 no
    // cae al catálogo en los previews `booking.daily_rate ?? forklift.daily_rate`).
    // Se envían las tarifas del equipo (unidad → defaults de su modelo), mismo
    // fallback que muestra EquipmentAssignmentDialog.
    const assignments = ids.map((fId) => {
      const forklift = forklifts.find((f) => f.id === fId);
      const model = equipmentModels?.find((m) => m.id === forklift?.equipment_model_id);
      return {
        forkliftId: fId,
        dailyRate: forklift?.daily_rate ?? model?.default_daily_rate ?? 0,
        weeklyRate: forklift?.weekly_rate ?? model?.default_weekly_rate ?? 0,
        monthlyRate: forklift?.monthly_rate ?? model?.default_monthly_rate ?? 0,
      };
    });
    await createBookingsFor(assignments, request);
  };

  return { createBookingsFor, convertLegacy };
}
