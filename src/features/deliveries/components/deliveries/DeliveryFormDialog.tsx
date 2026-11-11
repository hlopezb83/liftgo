import { useRef, useState, type ComponentProps } from "react";
import { useForm, useWatch } from "react-hook-form";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { PlusCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useConfirmedBookingsForDelivery } from "@/features/bookings";
import { useActiveDrivers, useForklift, useForkliftMap } from "@/features/fleet";
import { useHasModuleAccess } from "@/features/users";
import { toYMD } from "@/lib/format/dateFormats";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { nowMty, parseDateLocal } from "@/lib/utils";
import { useCreateDelivery } from "../../hooks/useDeliveries";
import { deliveryBookingDateError } from "../../lib/deliveryBookingDate";
import { deliverySchema } from "../../lib/deliveryFormSchema";
import { DeliveryFormFields, type DeliveryFormValues } from "./DeliveryFormFields";
import type { SelectableBooking } from "./selectableBookings";

export interface DeliveryBookingContext {
  booking: SelectableBooking;
  type: "delivery" | "pickup";
  /** Recheck current booking/transport facts on submit, not just the cached CTA. */
  verify: (values: DeliveryFormValues) => Promise<string | null>;
}

function getInitialForm(context?: DeliveryBookingContext): DeliveryFormValues {
  const today = toYMD(nowMty());
  const bookingDate = context?.type === "pickup" ? context.booking.end_date : context?.booking.start_date;
  return {
    forkliftId: context?.booking.forklift_id ?? "", bookingId: context?.booking.id ?? "", type: context?.type ?? "delivery",
    alreadyCompleted: false,
    scheduledDate: bookingDate && bookingDate > today ? parseDateLocal(bookingDate) : nowMty(), scheduledTime: "",
    address: "", driverName: "", driverPhone: "", notes: "", noEvidenceReason: "",
  };
}

function useDeliveryFormOptions(open: boolean, bookingId: string, context?: DeliveryBookingContext) {
  const { forklifts } = useForkliftMap(open && !context);
  const bookingQuery = useConfirmedBookingsForDelivery(open && !context);
  const bookings = context ? [context.booking] : bookingQuery.data?.pages.flatMap((page) => page.slice(0, 100));
  const selectedForkliftId = bookings?.find((booking) => booking.id === bookingId)?.forklift_id;
  const { data: selectedForklift } = useForklift(context ? undefined : selectedForkliftId);
  const contextForklift = context?.booking.forklifts && { id: context.booking.forklift_id, ...context.booking.forklifts };
  const resolvedForklift = selectedForklift ?? contextForklift;
  const forkliftOptions = resolvedForklift && !forklifts?.some((forklift) => forklift.id === resolvedForklift.id)
    ? [...(forklifts ?? []), resolvedForklift] : forklifts;
  return { bookingQuery, bookings, forkliftOptions };
}

async function submissionError(values: DeliveryFormValues, bookings: SelectableBooking[] | undefined, context?: DeliveryBookingContext) {
  if (context) {
    if (values.bookingId !== context.booking.id || values.forkliftId !== context.booking.forklift_id || values.type !== context.type) {
      return { field: "root" as const, message: "La operación no coincide con la reserva de origen. Cierra y vuelve a abrir el formulario." };
    }
    // Context verification also validates dates against the freshly read period.
    const message = await context.verify(values);
    return message ? { field: "root" as const, message } : null;
  }
  const booking = bookings?.find((b) => b.id === values.bookingId);
  const message = booking ? deliveryBookingDateError(values.type, toYMD(values.scheduledDate), booking) : null;
  return message ? { field: "scheduledDate" as const, message } : null;
}

function deliveryInput(values: DeliveryFormValues) {
  return {
    forklift_id: values.forkliftId,
    booking_id: values.bookingId || null,
    type: values.type,
    scheduled_date: toYMD(values.scheduledDate),
    scheduled_time: values.scheduledTime || null,
    address: values.address || null,
    driver_name: values.driverName || null,
    driver_phone: values.driverPhone || null,
    notes: values.notes || null,
    status: values.alreadyCompleted ? "completed" : "scheduled",
    // El servidor deriva completed_at de la fecha/hora elegida para
    // históricos y rechaza futuros; created_at conserva cuándo se capturó.
    // No enviar timestamps construidos con el reloj del navegador.
    // Bug 3: histórico sin operador → guardar la justificación capturada.
    completed_no_evidence_reason:
      values.alreadyCompleted && !values.driverName.trim() && values.noEvidenceReason.trim()
        ? values.noEvidenceReason.trim()
        : null,
  };
}

interface DeliveryFormDialogProps {
  /**
   * Control externo opcional del estado abierto (p. ej. el CTA del EmptyState
   * de la página). Sin estas props el diálogo se auto-gestiona, como antes.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  context?: DeliveryBookingContext;
  hideTrigger?: boolean;
  onCloseAutoFocus?: ComponentProps<typeof FormDialog>["onCloseAutoFocus"];
}

export function DeliveryFormDialog({ open: openProp, onOpenChange, context, hideTrigger, onCloseAutoFocus }: DeliveryFormDialogProps = {}) {
  const canWrite = useHasModuleAccess("Entregas", "full");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = canWrite && (openProp ?? internalOpen);
  const setOpen = (v: boolean) => {
    if (v && !canWrite) return;
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: getInitialForm(context),
  });
  const selectedBookingId = useWatch({ control: form.control, name: "bookingId" });
  const alreadyCompleted = useWatch({ control: form.control, name: "alreadyCompleted" });
  const { bookingQuery, bookings, forkliftOptions } = useDeliveryFormOptions(open, selectedBookingId, context);
  const { data: activeDrivers } = useActiveDrivers();
  const createDelivery = useCreateDelivery();

  const submitting = useRef(false);
  const isPending = createDelivery.isPending || form.formState.isSubmitting;
  const onSubmit = async (values: DeliveryFormValues) => {
    if (!canWrite || submitting.current || createDelivery.isPending) return;
    submitting.current = true;
    form.clearErrors("root");
    try {
      const error = await submissionError(values, bookings, context);
      if (error) {
        form.setError(error.field, { type: "manual", message: error.message });
        submitting.current = false;
        return;
      }
    } catch {
      form.setError("root", { message: "No se pudo comprobar la reserva y sus transportes. Reintenta antes de guardar." });
      submitting.current = false;
      return;
    }
    createDelivery.mutate(
      deliveryInput(values),
      {
        onSettled: () => { submitting.current = false; },
        onSuccess: () => {
          notifySuccess(values.alreadyCompleted ? "Transporte registrado como completado" : "Transporte programado");
          setOpen(false);
          form.reset(getInitialForm(context));
        },
      }
    );
  };

  if (!canWrite) return null;

  return (
    <>
      {!hideTrigger && <Button onClick={() => { form.reset(getInitialForm(context)); setOpen(true); }} size="sm">
        <PlusCircle className="h-4 w-4 mr-1" /> Programar
      </Button>}

      <FormDialog
        isPending={isPending}
        onCloseAutoFocus={onCloseAutoFocus}
        isDirty={form.formState.isDirty}
        open={open} onOpenChange={setOpen} title={alreadyCompleted ? "Registrar transporte realizado" : "Programar transporte"}>

        <form onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }} className="space-y-4">
          <DeliveryFormFields
            contextLocked={!!context}
            form={form} forklifts={forkliftOptions} bookings={bookings} activeDrivers={activeDrivers}
            bookingsLoading={!context && (bookingQuery.isLoading || bookingQuery.isFetchingNextPage)}
            bookingsError={!context && bookingQuery.isError}
            hasMoreBookings={!context && bookingQuery.hasNextPage}
            onLoadMoreBookings={() => { void bookingQuery.fetchNextPage(); }}
          />
          {form.formState.errors.root?.message && <p role="alert" className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <FormDialogFooter>
            <FormActions submitLabel={alreadyCompleted ? "Registrar como completado" : "Programar"} isPending={isPending} onCancel={() => setOpen(false)} />
          </FormDialogFooter>
        </form>
      </FormDialog>
    </>
  );
}
