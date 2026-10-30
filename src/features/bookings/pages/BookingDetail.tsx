import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { deliveryQueries } from "@/features/deliveries";
import { useHasModuleAccess } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { isValidUuid } from "@/lib/isValidUuid";
import { useLocation, useParams } from "@/lib/router-compat";
import { BookingBillingCard } from "../components/booking-detail/BookingBillingCard";
import { BookingCustomerCard } from "../components/booking-detail/BookingCustomerCard";
import { BookingExtensionsCard } from "../components/booking-detail/BookingExtensionsCard";
import { BookingHourometerCard } from "../components/booking-detail/BookingHourometerCard";
import { BookingSummaryCard } from "../components/booking-detail/BookingSummaryCard";
import { BookingTransportsCard } from "../components/booking-detail/BookingTransportsCard";
import { BookingActions } from "../components/bookings/BookingActions";
import { BookingStatusHistory } from "../components/bookings/BookingStatusHistory";
import { useBookingExtensions } from "../hooks/bookingActions/useBookingExtensions";
import { useBookingHourometer } from "../hooks/bookingDetail/useBookingHourometer";
import { useBooking } from "../hooks/bookings/useBookings";

function bookingBackTo(state: unknown): string {
  const quoteOrigin = (state as { quoteReturnTo?: unknown } | null)?.quoteReturnTo;
  if (typeof quoteOrigin === "string" && quoteOrigin.startsWith("/quotes/") && isValidUuid(quoteOrigin.slice(8))) return quoteOrigin;
  const origin = (state as { calendarReturnTo?: unknown } | null)?.calendarReturnTo;
  return typeof origin === "string" && /^\/calendar(?:\?[^#]*)?$/.test(origin) ? origin : "/bookings";
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateTransition();
  const location = useLocation();
  const backTo = bookingBackTo(location.state);
  const { data: booking, isLoading, isError, refetch } = useBooking(id);
  const canReadTransports = useHasModuleAccess("Entregas", "read");
  const { data: deliveries, isLoading: transportsLoading, isError: transportsError, isFetching: transportsFetching, refetch: refetchTransports } = useQuery({
    ...deliveryQueries.list({ bookingId: id }),
    enabled: canReadTransports,
  });
  const { data: extensions } = useBookingExtensions(id);

  const readableDeliveries = canReadTransports ? deliveries : undefined;
  const hourometer = useBookingHourometer(
    !transportsLoading && !transportsError ? readableDeliveries : undefined,
  );

  if (isLoading) {
    return (
      <PageContainer maxWidth="wide">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer maxWidth="wide">
        <QueryErrorState entity="la reserva" onRetry={() => { void refetch(); }} />
      </PageContainer>
    );
  }

  if (!booking) {
    return (
      <PageContainer maxWidth="wide">
        <EmptyState
          title="Reserva no encontrada"
          actionLabel="Volver"
          onAction={() => navigate(backTo)}
        />
      </PageContainer>
    );
  }

  const forkliftName = booking.forklifts?.name ?? "";
  const forkliftModel = booking.forklifts?.model ?? "";
  const extensionsList = extensions ?? [];

  return (
    <PageContainer maxWidth="wide">
      <DetailPageHeader
        title={booking.booking_number}
        backTo={backTo}
        actions={<BookingActions
          booking={booking}
          deliveries={readableDeliveries}
          transportsLoading={transportsLoading}
          transportsError={transportsError}
        />}
      />
      <BookingSummaryCard
        name={forkliftName}
        model={forkliftModel}
        startDate={booking.start_date}
        endDate={booking.end_date}
        status={booking.status}
      />
      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
        <BookingCustomerCard
          customerName={booking.customer_name}
          customerContact={booking.customer_contact}
          siteContactName={booking.site_contact_name}
          siteContactPhone={booking.site_contact_phone}
        />
        <BookingBillingCard booking={booking} />
      </div>

      <BookingTransportsCard
        deliveries={readableDeliveries}
        isLoading={transportsLoading}
        isError={transportsError}
        isRetrying={transportsFetching}
        onRetry={() => { void refetchTransports(); }}
      />
      <BookingHourometerCard {...hourometer} />
      <BookingExtensionsCard
        extensions={extensionsList}
        recurringBilling={booking.recurring_billing}
      />

      <BookingStatusHistory bookingId={booking.id} />
    </PageContainer>
  );
}
