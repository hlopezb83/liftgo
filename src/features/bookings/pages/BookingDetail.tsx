import { useState } from "react";
import { useParams } from "react-router";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeliveries } from "@/features/deliveries";
import { BookingBillingCard } from "../components/booking-detail/BookingBillingCard";
import { BookingCustomerCard } from "../components/booking-detail/BookingCustomerCard";
import { BookingEquipmentCard } from "../components/booking-detail/BookingEquipmentCard";
import { BookingExtensionsCard } from "../components/booking-detail/BookingExtensionsCard";
import { BookingHourometerCard } from "../components/booking-detail/BookingHourometerCard";
import { BookingPeriodCard } from "../components/booking-detail/BookingPeriodCard";
import { BookingActions } from "../components/bookings/BookingActions";
import { BookingStatusHistory } from "../components/bookings/BookingStatusHistory";
import { ExtendBookingDialog } from "../components/bookings/ExtendBookingDialog";
import { useBookingHourometer } from "../hooks/bookingDetail/useBookingHourometer";
import { useBookingExtensions } from "../hooks/useBookingExtensions";
import { useBooking } from "../hooks/useBookings";

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: booking, isLoading } = useBooking(id);
  const { data: deliveries } = useDeliveries(id);
  const { data: extensions } = useBookingExtensions(id);
  const [extendOpen, setExtendOpen] = useState(false);

  const hourometer = useBookingHourometer(deliveries);

  if (isLoading) {
    return (
      <PageContainer maxWidth="wide">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </PageContainer>
    );
  }

  if (!booking) {
    return (
      <PageContainer maxWidth="wide">
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">Reserva no encontrada</p>
        </div>
      </PageContainer>
    );
  }

  const forkliftName = booking.forklifts?.name ?? "";
  const forkliftModel = booking.forklifts?.model ?? "";
  const subtitleName = forkliftName || "Equipo";
  const subtitleCustomer = booking.customer_name ?? "Sin cliente";
  const subtitle = `${subtitleName} · ${subtitleCustomer}`;
  const extensionsList = extensions ?? [];

  return (
    <PageContainer maxWidth="wide">
      <DetailPageHeader
        title={booking.booking_number}
        subtitle={subtitle}
        badges={<StatusBadge status={booking.status} />}
        backTo="/bookings"
        actions={<BookingActions booking={booking} />}
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
    </PageContainer>
  );
}
