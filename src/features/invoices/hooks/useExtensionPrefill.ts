import { useEffect, useRef } from "react";
import {
  buildExtensionLineItems,
  extensionBillableRange,
  useBookingExtension,
} from "@/features/bookings";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

interface Params {
  isEdit: boolean;
  extensionId: string | null;
  /** Catálogo de clientes ya cargado (evita que Radix borre el prefill). */
  customersLoaded: boolean;
  form: UseFormReturn<InvoiceFormValues>;
  handleCustomerSelect: (id: string) => void;
}

/**
 * v7.307.0 — Prefill al llegar desde "Facturar extensión".
 *
 * Carga la extensión con su reserva y equipo, y prellena cliente + partidas
 * SÓLO del tramo extendido (`original_end_date + 1` … `new_end_date`).
 * Bloquea si la extensión ya tiene factura ligada (guard anti doble cobro).
 */
export function useExtensionPrefill({
  isEdit, extensionId, customersLoaded, form, handleCustomerSelect,
}: Params) {
  const { data: ext } = useBookingExtension(
    !isEdit && extensionId ? extensionId : undefined,
  );
  const prefilledRef = useRef(false);

  useEffect(() => {
    if (prefilledRef.current || isEdit || !extensionId || !ext || !customersLoaded) return;
    prefilledRef.current = true;

    if (ext.invoice_id) {
      notifyError({ title: "Esta extensión ya fue facturada" });
      return;
    }

    const booking = ext.bookings;
    const range = extensionBillableRange(ext.original_end_date, ext.new_end_date);
    if (!range) {
      notifyWarning({
        title: "La extensión no agrega días facturables",
        description: "La nueva fecha de fin no es posterior a la original.",
      });
      return;
    }

    if (booking?.customer_id) handleCustomerSelect(booking.customer_id);
    if (booking?.customer_name) {
      form.setValue("customerName", booking.customer_name, { shouldDirty: true });
    }
    if (booking?.id) {
      form.setValue("bookingIds", [booking.id], { shouldDirty: true });
      form.setValue("bookingId", booking.id, { shouldDirty: true });
    }

    const forklift = booking?.forklifts ?? null;
    const items = buildExtensionLineItems({
      originalEndDate: ext.original_end_date,
      newEndDate: ext.new_end_date,
      forkliftRates: {
        daily_rate: forklift?.daily_rate,
        weekly_rate: forklift?.weekly_rate,
        monthly_rate: forklift?.monthly_rate,
      },
      bookingMonthlyRate: booking?.monthly_rate,
      forkliftName: forklift?.name,
      serialNumber: forklift?.serial_number,
    });

    if (items.length === 0) {
      notifyWarning({
        title: "El equipo no tiene tarifas configuradas",
        description: `Captura la partida a mano: ${range.days} día(s) del ${range.start} al ${range.end}.`,
      });
      return;
    }

    form.setValue(
      "lineItems",
      items.map((i) => ({
        ...i,
        clave_prod_serv: "78181500",
        clave_unidad: "DAY",
        objeto_imp: "02",
      })),
      { shouldDirty: true },
    );
  }, [isEdit, extensionId, ext, customersLoaded, form, handleCustomerSelect]);

  return { extension: ext ?? null };
}
