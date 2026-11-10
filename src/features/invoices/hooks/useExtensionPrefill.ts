import { useEffect, useRef, useState } from "react";
import {
  buildExtensionLineItems,
  extensionBillableRange,
  useBookingExtension,
} from "@/features/bookings";
import { useCustomer } from "@/features/customers";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import { applyPrimaryCurrency } from "./invoiceForm/useInvoiceFormHandlers";
import type { Customer } from "./invoiceForm/invoiceFormBuilders";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

interface Params {
  isEdit: boolean;
  extensionId: string | null;
  form: UseFormReturn<InvoiceFormValues>;
  handleCustomerSelect: (id: string, customer?: Customer) => void;
}

/**
 * v7.307.0 — Prefill al llegar desde "Facturar extensión".
 *
 * Carga la extensión con su reserva y equipo, y prellena cliente + partidas
 * SÓLO del tramo extendido (`original_end_date + 1` … `new_end_date`).
 * Bloquea si la extensión ya tiene factura ligada (guard anti doble cobro).
 */
type ExtensionBooking = {
  id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  daily_rate?: number | null;
  weekly_rate?: number | null;
  monthly_rate?: number | null;
  currency?: string | null;
  tipo_cambio?: number | null;
  forklifts?: {
    name?: string | null;
    serial_number?: string | null;
    daily_rate?: number | null;
    weekly_rate?: number | null;
    monthly_rate?: number | null;
  } | null;
} | null;

/** Prellena cliente y reserva ligada en el formulario. */
function applyBookingFields(
  form: UseFormReturn<InvoiceFormValues>,
  booking: ExtensionBooking,
  handleCustomerSelect: Params["handleCustomerSelect"],
  customer: Customer,
) {
  if (!booking) return;
  if (booking.customer_id) handleCustomerSelect(booking.customer_id, customer);
  if (booking.customer_name) {
    form.setValue("customerName", booking.customer_name, { shouldDirty: true });
  }
  if (booking.id) {
    form.setValue("bookingIds", [booking.id], { shouldDirty: true });
    form.setValue("bookingId", booking.id, { shouldDirty: true });
  }
  applyPrimaryCurrency(form, booking);
}

/** Partidas del tramo extendido, según tarifas del equipo o de la reserva. */
function buildItemsForExtension(
  originalEndDate: string,
  newEndDate: string,
  booking: ExtensionBooking,
) {
  const forklift = booking?.forklifts ?? null;
  return buildExtensionLineItems({
    originalEndDate,
    newEndDate,
    forkliftRates: {
      daily_rate: forklift?.daily_rate,
      weekly_rate: forklift?.weekly_rate,
      monthly_rate: forklift?.monthly_rate,
    },
    // F1 (Sprint M1): las tarifas pactadas diaria/semanal también ganan
    // sobre el catálogo (antes sólo la mensual).
    bookingRates: {
      daily_rate: booking?.daily_rate,
      weekly_rate: booking?.weekly_rate,
      monthly_rate: booking?.monthly_rate,
    },
    forkliftName: forklift?.name,
    serialNumber: forklift?.serial_number,
  });
}

function extensionReadBlock(loading: boolean, extensionError: boolean, ext: ReturnType<typeof useBookingExtension>["data"], customer: ReturnType<typeof useCustomer>) {
  if (loading) return "Verificando el cliente de la extensión…";
  if (extensionError || !ext) return "No se pudo cargar la extensión. Reintenta la consulta.";
  if (ext.invoice_id) return "Esta extensión ya fue facturada.";
  if (customer.isError || !customer.data || customer.data.id !== ext.bookings?.customer_id) {
    return "No se pudo verificar el cliente de la extensión. Reintenta la consulta.";
  }
  return null;
}

function queryIsLoading(query: { isPending: boolean; isFetching: boolean; fetchStatus: string }): boolean {
  return query.isPending || query.isFetching || query.fetchStatus === "paused";
}

function prefillStateBlock(active: boolean, applied: boolean, interrupted: boolean, loading: boolean,
  extension: ReturnType<typeof useBookingExtension>, customer: ReturnType<typeof useCustomer>) {
  if (!active || applied) return null;
  if (interrupted) return "Cambiaste el formulario mientras cargaba la extensión. Para conservar tus cambios no se aplicó el prellenado. Vuelve a abrir Facturar extensión desde la reserva.";
  return extensionReadBlock(loading, extension.isError, extension.data, customer);
}

function interruptsExtensionPrefill(name?: string): boolean {
  return !name || ["customerId", "customerName", "taxRate", "cfdi", "bookingId", "bookingIds",
    "lineItems", "billingPeriodStart", "billingPeriodEnd"].includes(name)
    || name.startsWith("cfdi.") || name.startsWith("lineItems.");
}

export function useExtensionPrefill({
  isEdit, extensionId, form, handleCustomerSelect,
}: Params) {
  const active = !isEdit && !!extensionId;
  const extensionQuery = useBookingExtension(active ? extensionId : undefined);
  const ext = extensionQuery.data;
  const customerId = active && !ext?.invoice_id ? ext?.bookings?.customer_id ?? undefined : undefined;
  const customerQuery = useCustomer(customerId);
  const prefilledRef = useRef(false);
  const [applied, setApplied] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const loading = queryIsLoading(extensionQuery) || (!!customerId && queryIsLoading(customerQuery));
  const prefillBlock = prefillStateBlock(active, applied, interrupted, loading, extensionQuery, customerQuery);

  // Observe user intent, including clear/reset to the original value. Checking
  // only current values cannot detect that case. Our own prefill is latched first.
  useEffect(() => {
    if (!active) return;
    const subscription = form.watch((_values, { name }) => {
      if (!prefilledRef.current && interruptsExtensionPrefill(name)) setInterrupted(true);
    });
    return () => subscription.unsubscribe();
  }, [active, form]);

  usePrefillEffect(() => {
    if (prefilledRef.current || !active || !ext) return;

    if (ext.invoice_id) {
      prefilledRef.current = true;
      notifyError({ title: "Esta extensión ya fue facturada" });
      return;
    }

    if (prefillBlock || !customerQuery.data) return;
    prefilledRef.current = true;
    setApplied(true);
    const booking = ext.bookings;
    const range = extensionBillableRange(ext.original_end_date, ext.new_end_date);
    if (!range) {
      notifyWarning({
        title: "La extensión no agrega días facturables",
        description: "La nueva fecha de fin no es posterior a la original.",
      });
      return;
    }

    applyBookingFields(form, booking as ExtensionBooking, handleCustomerSelect, customerQuery.data);

    // H-6: el periodo de facturación de una extensión es el tramo extendido
    // (no el mes de emisión), para que coincida con los días cobrados.
    form.setValue("billingPeriodStart", range.start, { shouldDirty: true });
    form.setValue("billingPeriodEnd", range.end, { shouldDirty: true });

    const items = buildItemsForExtension(
      ext.original_end_date,
      ext.new_end_date,
      booking as ExtensionBooking,
    );

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
        // La unidad SAT sigue al cobro real (MON/WEE/DAY/E48), no un DAY fijo.
        clave_unidad: i.clave_unidad,
        objeto_imp: "02",
      })),
      { shouldDirty: true },
    );
  }, [active, ext, prefillBlock, customerQuery.data]);

  return {
    extension: ext ?? null,
    prefillBlock,
    interruptPrefill: () => { if (active && !prefilledRef.current) setInterrupted(true); },
    isLoadingPrefill: active && !applied && !interrupted && loading,
    retryPrefill: () => Promise.all([extensionQuery.refetch(), customerId ? customerQuery.refetch() : Promise.resolve()]),
  };
}
