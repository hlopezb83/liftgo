import { useEffect, useRef, useState } from "react";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { applySelectedCustomer, type InvoiceHandlerBooking } from "./bookingRentalLines";
import type { Customer } from "./invoiceFormBuilders";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

interface DetachedSelectionSnapshot {
  customerId: string;
  ids: string[];
  primary: string;
}

function incompatibleCustomerBookings(
  form: UseFormReturn<InvoiceFormValues>,
  bookings: InvoiceHandlerBooking[] | undefined,
  customerId: string,
): boolean {
  if (customerId === form.getValues("customerId")) return false;
  const ids = [...(form.getValues("bookingIds") ?? []), form.getValues("bookingId")].filter(Boolean);
  return ids.some((id) => {
    const booking = bookings?.find((candidate) => candidate.id === id);
    return !booking || booking.customer_id !== customerId;
  });
}

function buildSwitchReviewMessage(hasDetached: boolean): string {
  const recovery = hasDetached
    ? "Selecciona el cliente anterior o vuelve a seleccionar reservas compatibles"
    : "Vuelve a seleccionar reservas compatibles";
  return `Cambiaste el cliente. ${recovery} y revisa las partidas antes de guardar.`;
}

export function useDetachedCustomerSelection(
  form: UseFormReturn<InvoiceFormValues>,
  customers: Customer[] | undefined,
  bookings: InvoiceHandlerBooking[] | undefined,
) {
  const selectionRequest = useRef(0);
  const [isLoadingCharges, setIsLoadingCharges] = useState(false);
  const [chargeSelectionError, setChargeSelectionError] = useState<string | null>(null);
  const lastSelection = useRef<string[]>([]);
  const pendingSelection = useRef(false);
  const selectionNeedsReview = useRef(false);
  const detachedSelection = useRef<DetachedSelectionSnapshot | null>(null);

  useEffect(() => () => { ++selectionRequest.current; }, []);

  const restoreDetachedIfMatching = (selectedCustomerId: string): boolean => {
    const restore = detachedSelection.current?.customerId === selectedCustomerId ? detachedSelection.current : null;
    if (!restore) return false;
    form.setValue("bookingIds", restore.ids, { shouldDirty: true });
    form.setValue("bookingId", restore.primary, { shouldDirty: true });
    detachedSelection.current = null;
    selectionNeedsReview.current = false;
    setChargeSelectionError(null);
    return true;
  };

  const detachIfIncompatible = (previousCustomerId: string, selectedCustomerId: string): boolean => {
    if (!incompatibleCustomerBookings(form, bookings, selectedCustomerId)) return false;
    const linked = form.getValues("bookingIds") ?? [];
    const primary = form.getValues("bookingId");
    detachedSelection.current ??= { customerId: previousCustomerId, ids: linked, primary };
    form.setValue("bookingIds", [], { shouldDirty: true });
    form.setValue("bookingId", "", { shouldDirty: true });
    return true;
  };

  const handleCustomerSelect = (selectedCustomerId: string, selectedCustomer?: Customer) => {
    // A manual receiver choice supersedes a pending booking request. Do not
    // permit Retry to resurrect that request or silently reassign the receiver.
    const canceled = pendingSelection.current || (chargeSelectionError !== null && lastSelection.current.length > 0);
    ++selectionRequest.current;
    pendingSelection.current = false;
    setIsLoadingCharges(false);
    lastSelection.current = [];
    const previousCustomerId = form.getValues("customerId");
    const restored = restoreDetachedIfMatching(selectedCustomerId);
    const incompatible = !restored && detachIfIncompatible(previousCustomerId, selectedCustomerId);
    if (!restored && (canceled || incompatible)) {
      selectionNeedsReview.current = true;
      const message = buildSwitchReviewMessage(detachedSelection.current !== null);
      setChargeSelectionError(message);
      notifyValidation({ message });
    }
    applySelectedCustomer(form, customers, selectedCustomerId, selectedCustomer);
  };

  const beginSelectionRequest = (selectedIds: string[]): number | null => {
    if (selectionNeedsReview.current && selectedIds.length === 0) {
      ++selectionRequest.current;
      pendingSelection.current = false;
      lastSelection.current = [];
      setIsLoadingCharges(false);
      return null;
    }
    const request = ++selectionRequest.current;
    if (!selectionNeedsReview.current) setChargeSelectionError(null);
    lastSelection.current = selectedIds;
    pendingSelection.current = true;
    setIsLoadingCharges(true);
    return request;
  };

  const isCurrentRequest = (request: number): boolean => request === selectionRequest.current;

  const failSelectionRequest = (request: number, error: unknown) => {
    if (request !== selectionRequest.current) return;
    const message = error instanceof Error ? error.message : "No se pudieron recuperar los precios pactados.";
    setChargeSelectionError(message);
    notifyValidation({ message });
  };

  const finishSelectionRequest = (request: number) => {
    if (request !== selectionRequest.current) return;
    pendingSelection.current = false;
    setIsLoadingCharges(false);
  };

  const completeSelectionSuccess = () => {
    selectionNeedsReview.current = false;
    detachedSelection.current = null;
    setChargeSelectionError(null);
  };

  const getRetrySelectionIds = (): string[] => lastSelection.current;

  return {
    isLoadingCharges,
    chargeSelectionError,
    handleCustomerSelect,
    beginSelectionRequest,
    isCurrentRequest,
    failSelectionRequest,
    finishSelectionRequest,
    completeSelectionSuccess,
    getRetrySelectionIds,
  };
}
