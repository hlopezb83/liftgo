import { DeliverySignatureDialog } from "./DeliverySignatureDialog";
import { PostDeliveryPickupDialog } from "./PostDeliveryPickupDialog";

type PickupPrompt = {
  delivery: { forklift_id: string; booking_id: string | null; address: string | null; driver_name: string | null; driver_phone: string | null; hours_reading: number | null };
  bookingEndDate: string;
  forkliftName: string;
};

interface Props {
  signatureOpen: boolean;
  setSignatureOpen: (open: boolean) => void;
  hoursReading: string;
  setHoursReading: (value: string) => void;
  onComplete: (signature?: string) => void;
  pickupPrompt: PickupPrompt | null;
  onPickupClose: () => void;
  /** R10 Bloque 4: horómetro de entrega si el detalle actual es pickup. */
  minHours?: number | null;
}

export function DeliveryDetailDialogs({
  signatureOpen, setSignatureOpen, hoursReading, setHoursReading, onComplete,
  pickupPrompt, onPickupClose, minHours,
}: Props) {
  return (
    <>
      <DeliverySignatureDialog
        open={signatureOpen}
        onOpenChange={setSignatureOpen}
        hoursReading={hoursReading}
        onHoursReadingChange={setHoursReading}
        onComplete={onComplete}
        minHours={minHours}
      />

      {pickupPrompt && (
        <PostDeliveryPickupDialog
          open
          onOpenChange={(open) => { if (!open) onPickupClose(); }}
          delivery={pickupPrompt.delivery}
          bookingEndDate={pickupPrompt.bookingEndDate}
          forkliftName={pickupPrompt.forkliftName}
        />
      )}
    </>
  );
}
