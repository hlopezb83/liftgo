import { useState } from "react";
import { useParams } from "react-router-dom";

import { useBooking } from "@/features/bookings/hooks/useBookings";
import { useDeliveries } from "@/features/deliveries/hooks/useDeliveries";
import { useBookingExtensions } from "@/features/bookings/hooks/useBookingExtensions";
import { useBookingHourometer } from "@/features/bookings/hooks/bookingDetail/useBookingHourometer";

import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { BookingActions } from "@/features/bookings/components/bookings/BookingActions";
import { BookingStatusHistory } from "@/features/bookings/components/bookings/BookingStatusHistory";
import { ExtendBookingDialog } from "@/features/bookings/components/bookings/ExtendBookingDialog";
import { BookingEquipmentCard } from "@/features/bookings/components/booking-detail/BookingEquipmentCard";
import { BookingCustomerCard } from "@/features/bookings/components/booking-detail/BookingCustomerCard";
import { BookingPeriodCard } from "@/features/bookings/components/booking-detail/BookingPeriodCard";
import { BookingBillingCard } from "@/features/bookings/components/booking-detail/BookingBillingCard";
import { BookingHourometerCard } from "@/features/bookings/components/booking-detail/BookingHourometerCard";
import { BookingExtensionsCard } from "@/features/bookings/components/booking-detail/BookingExtensionsCard";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarPlus } from "lucide-react";

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isLoading } = useBooking(id);
  const { data: deliveries } = useDeliveries(id);
  const { data: extensions } = useBookingExtensions(id);
  const [extendOpen, setExtendOpen] = useState(false);

  const hourometer = useBookingHourometer(deliveries);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground">Reserva no encontrada</p>
      </div>
    );
  }

  const forkliftName = booking.forklifts?.name ?? "";
  const forkliftModel = booking.forklifts?.model ?? "";
  const subtitleName = forkliftName || "Equipo";
  const subtitleCustomer = booking.customer_name ?? "Sin cliente";
  const subtitle = `${subtitleName} · ${subtitleCustomer}`;
  const canExtend = booking.status === "confirmed";
  const extensionsList = extensions ?? [];

  return (
    <div className="space-y-6">
      <DetailPageHeader
        title={booking.booking_number}
        subtitle={subtitle}
        badges={<StatusBadge status={booking.status} />}
        backTo="/bookings"
        actions={
          <div className="flex gap-2">
            {canExtend && (
              <Button variant="outline" size="sm" onClick={() => setExtendOpen(true)}>
                <CalendarPlus className="h-4 w-4 mr-1" /> Extender Renta
              </Button>
            )}
            <BookingActions booking={booking} />
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <BookingEquipmentCard name={forkliftName} model={forkliftModel} />
        <BookingCustomerCard
          customerName={booking.customer_name}
          customerContact={booking.customer_contact}
          siteContactName={booking.site_contact_name}
          siteContactPhone={booking.site_contact_phone}
        />
        <BookingPeriodCard startDate={booking.start_date} endDate={booking.end_date} />
        <BookingBillingCard booking={booking} />
      </div>

      <BookingHourometerCard {...hourometer} />
      <BookingExtensionsCard extensions={extensionsList} />

      <BookingStatusHistory bookingId={booking.id} />

      {extendOpen && (
        <ExtendBookingDialog
          open={extendOpen}
          onOpenChange={setExtendOpen}
          bookingId={booking.id}
          currentEndDate={booking.end_date}
        />
      )}
    </div>
  );
}
