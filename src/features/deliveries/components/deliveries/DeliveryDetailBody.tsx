import { NotesCard } from "@/components/domain/NotesCard";
import type { Tables } from "@/integrations/supabase/types";
import {
  DeliveryStatusCard, DeliveryEquipmentCard, DeliveryLogisticsCard, DeliveryBookingCard,
} from "./DeliveryInfoCards";
import { DeliverySignatureCard } from "./DeliverySignatureCard";

type Delivery = Tables<"deliveries">;

interface LinkedBooking {
  booking_number: string;
  customer_name: string | null;
  start_date: string;
  end_date: string;
}

interface DeliveryDetailBodyProps {
  delivery: Delivery;
  forkliftName?: string;
  forkliftModel?: string;
  hoursUsed: number | null;
  linkedBooking: LinkedBooking | null;
}

/** Cuerpo puro del detalle de transporte (tarjetas de información). */
export function DeliveryDetailBody({
  delivery,
  forkliftName,
  forkliftModel,
  hoursUsed,
  linkedBooking,
}: DeliveryDetailBodyProps) {
  return (
    <>
      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
        <DeliveryStatusCard
          type={delivery.type}
          scheduledDate={delivery.scheduled_date}
          scheduledTime={delivery.scheduled_time}
          completedAt={delivery.completed_at}
        />
        <DeliveryEquipmentCard
          forkliftName={forkliftName}
          forkliftModel={forkliftModel}
          hoursReading={delivery.hours_reading}
          hoursUsed={hoursUsed}
        />
        <DeliveryLogisticsCard
          address={delivery.address}
          driverName={delivery.driver_name}
          driverPhone={delivery.driver_phone}
          transportCost={delivery.transport_cost}
          chargedToCustomer={delivery.charged_to_customer}
        />
        {linkedBooking && (
          <DeliveryBookingCard
            bookingNumber={linkedBooking.booking_number}
            customerName={linkedBooking.customer_name}
            startDate={linkedBooking.start_date}
            endDate={linkedBooking.end_date}
          />
        )}
      </div>

      {delivery.notes && <NotesCard value={delivery.notes} readOnly title="Notas" />}

      <DeliverySignatureCard signatureBase64={delivery.signature_base64} />
    </>
  );
}
