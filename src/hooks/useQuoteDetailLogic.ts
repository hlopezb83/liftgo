import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { differenceInDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useQuote, useUpdateQuote, useDeleteQuote } from "@/hooks/useQuotes";
import { useCreateBooking } from "@/hooks/useBookings";
import { useCustomers } from "@/hooks/useCustomers";
import { useForklifts } from "@/hooks/useForklifts";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LineItem } from "@/lib/invoiceUtils";
import type { AppRole } from "@/hooks/useUserRole";

export interface DeliveryInfo {
  bookingId: string;
  forkliftId: string;
  forkliftName: string;
  startDate: string;
  customerAddress: string | null;
}

const isPublicoGeneral = (name?: string | null) =>
  !!name && (name.trim().toLowerCase().includes("público en general") || name.trim().toLowerCase().includes("publico en general"));

export function useQuoteDetailLogic(id: string | undefined) {
  const navigate = useNavigate();
  const { data: quote, isLoading } = useQuote(id);
  const updateQuote = useUpdateQuote();
  const deleteQuote = useDeleteQuote();
  const createBooking = useCreateBooking();
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const { data: equipmentModels } = useEquipmentModels();

  // State
  const [pendingDeliveries, setPendingDeliveries] = useState<DeliveryInfo[]>([]);
  const [currentDeliveryIndex, setCurrentDeliveryIndex] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [showCustomerReassignDialog, setShowCustomerReassignDialog] = useState(false);
  const [reassignCustomerId, setReassignCustomerId] = useState("");
  const [reassignCustomerName, setReassignCustomerName] = useState("");
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [pendingRecurring, setPendingRecurring] = useState(false);

  // Derived data
  const { data: linkedBookings } = useQuery({
    queryKey: ["bookings_for_quote", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("id").eq("quote_id", id!);
      return data || [];
    },
  });
  const alreadyConverted = (linkedBookings?.length ?? 0) > 0;

  const customerMatch = useMemo(() => customers?.find(c => c.id === quote?.customer_id), [customers, quote?.customer_id]);
  const quoteType = quote?.quote_type || "rental";
  const isSale = quoteType === "sale";
  const lineItems = useMemo(() => (quote?.line_items as unknown as LineItem[]) || [], [quote?.line_items]);

  const durationDays = useMemo(() => {
    if (!quote?.start_date || !quote?.end_date) return 0;
    return differenceInDays(new Date(quote.end_date), new Date(quote.start_date));
  }, [quote?.start_date, quote?.end_date]);

  const rentalMeta = useMemo(() => {
    if (!quote || isSale) return [];
    const fromColumn = quote.rental_meta as unknown as { modelId: string; quantity: number }[] | undefined;
    if (fromColumn && fromColumn.length > 0) return fromColumn;
    const allItems = (quote.line_items as unknown as LineItem[]) || [];
    const legacy = (allItems as unknown as Array<LineItem & { _rentalMeta?: { modelId: string; quantity: number }[] }>)?.[0]?._rentalMeta;
    return legacy || [];
  }, [quote, isSale]);

  const isModelBasedQuote = rentalMeta.length > 0;

  // Actions
  const setStatus = (status: string) => {
    if (!id) return;
    updateQuote.mutate({ id, status }, { onSuccess: () => toast.success(`Cotización marcada como ${status}`) });
  };

  const handleDeliveryNext = () => {
    if (currentDeliveryIndex < pendingDeliveries.length - 1) {
      setCurrentDeliveryIndex((prev) => prev + 1);
    } else {
      setPendingDeliveries([]);
      setCurrentDeliveryIndex(0);
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

  const handleConvertClick = () => {
    if (isPublicoGeneral(quote?.customer_name)) {
      setReassignCustomerId("");
      setReassignCustomerName("");
      setShowCustomerReassignDialog(true);
    } else {
      proceedWithConversion();
    }
  };

  const proceedWithConversion = () => {
    if (isModelBasedQuote) {
      if (durationDays >= 30) {
        setShowRecurringDialog(true);
      } else {
        setPendingRecurring(false);
        setShowAssignmentDialog(true);
      }
    } else {
      if (durationDays >= 30) {
        setShowRecurringDialog(true);
      } else {
        convertToBookingLegacy(false);
      }
    }
  };

  const handleReassignConfirm = async () => {
    if (!quote || !reassignCustomerId) return;
    await updateQuote.mutateAsync({ id: quote.id, customer_id: reassignCustomerId, customer_name: reassignCustomerName });
    setShowCustomerReassignDialog(false);
    toast.success("Cliente actualizado");
    proceedWithConversion();
  };

  const handleRecurringChoice = (recurring: boolean) => {
    setShowRecurringDialog(false);
    setPendingRecurring(recurring);
    if (isModelBasedQuote) {
      setShowAssignmentDialog(true);
    } else {
      convertToBookingLegacy(recurring);
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
        startDate: quote?.start_date!,
        customerAddress: cust?.address || null,
      };
    });
  };

  const handleAssignmentConfirm = async (forkliftIds: string[]) => {
    if (!quote || !forklifts) return;
    setIsConverting(true);
    try {
      const createdBookingIds: string[] = [];
      for (const fId of forkliftIds) {
        const bookingId = await createBooking.mutateAsync({
          forklift_id: fId,
          start_date: quote.start_date!,
          end_date: quote.end_date!,
          customer_name: quote.customer_name,
          customer_id: quote.customer_id,
          status: "confirmed",
          recurring_billing: pendingRecurring,
        });
        await supabase.from("bookings").update({ quote_id: quote.id }).eq("id", bookingId);
        createdBookingIds.push(bookingId);
      }
      updateQuote.mutate({ id: quote.id, status: "accepted" });
      toast.success(`${createdBookingIds.length} reserva(s) creada(s) desde cotización`);
      setShowAssignmentDialog(false);
      setCurrentDeliveryIndex(0);
      setPendingDeliveries(createDeliveryInfos(forkliftIds, createdBookingIds));
    } catch (err: unknown) {
      toast.error(`Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setIsConverting(false);
    }
  };

  const convertToBookingLegacy = async (recurringBilling: boolean) => {
    if (!quote || !forklifts) return;
    const items = (quote.line_items as unknown as LineItem[]) || [];
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

    setIsConverting(true);
    try {
      const createdBookingIds: string[] = [];
      for (const fId of forkliftIds) {
        const bookingId = await createBooking.mutateAsync({
          forklift_id: fId,
          start_date: quote.start_date!,
          end_date: quote.end_date!,
          customer_name: quote.customer_name,
          customer_id: quote.customer_id,
          status: "confirmed",
          recurring_billing: recurringBilling,
        });
        await supabase.from("bookings").update({ quote_id: quote.id }).eq("id", bookingId);
        createdBookingIds.push(bookingId);
      }
      updateQuote.mutate({ id: quote.id, status: "accepted" });
      toast.success(`${createdBookingIds.length} reserva(s) creada(s) desde cotización`);
      setCurrentDeliveryIndex(0);
      setPendingDeliveries(createDeliveryInfos(forkliftIds, createdBookingIds));
    } catch (err) {
      toast.error(`Error al crear reserva: ${err instanceof Error ? err.message : "Error desconocido"}`);
    } finally {
      setIsConverting(false);
    }
  };

  return {
    // Data
    quote,
    isLoading,
    lineItems,
    customerMatch,
    quoteType,
    isSale,
    alreadyConverted,
    durationDays,
    rentalMeta,
    customers,
    forklifts,
    equipmentModels,

    // Conversion state
    isConverting,
    showRecurringDialog,
    setShowRecurringDialog,
    showCustomerReassignDialog,
    setShowCustomerReassignDialog,
    reassignCustomerId,
    setReassignCustomerId,
    reassignCustomerName,
    setReassignCustomerName,
    showAssignmentDialog,
    setShowAssignmentDialog,

    // Delivery state
    pendingDeliveries,
    currentDeliveryIndex,

    // Actions
    setStatus,
    handleDelete,
    handleConvertClick,
    handleReassignConfirm,
    handleRecurringChoice,
    handleAssignmentConfirm,
    handleDeliveryNext,

    // Helpers
    isPublicoGeneral,
  };
}
