import { PostBookingDeliveryDialog } from "./PostBookingDeliveryDialog";
import { PostBookingPolicyDialog } from "./PostBookingPolicyDialog";

type PostBooking = {
  bookingId: string;
  forkliftId: string;
  forkliftName: string;
  startDate: string;
  customerAddress?: string | null;
};

interface Props {
  postBooking: PostBooking | null;
  showPolicyDialog: boolean;
  /**
   * Fallback: se usa sólo si el snapshot capturado en postBooking no llegó
   * (edge case). El nombre "real" viene de postBooking.forkliftName para no
   * depender del cache de forklifts disponibles, que ya fue invalidado.
   */
  forkliftName: string;
  onDeliveryDone: () => void;
  onPolicyDone: () => void;
}

export function BookingPostDialogs({ postBooking, showPolicyDialog, forkliftName, onDeliveryDone, onPolicyDone }: Props) {
  if (!postBooking) return null;
  const name = postBooking.forkliftName || forkliftName;
  const showDelivery = !showPolicyDialog;
  return (
    <>
      {showDelivery && (
        <PostBookingDeliveryDialog
          open
          onOpenChange={(open) => { if (!open) onDeliveryDone(); }}
          bookingId={postBooking.bookingId}
          forkliftId={postBooking.forkliftId}
          forkliftName={name}
          startDate={postBooking.startDate}
          customerAddress={postBooking.customerAddress ?? null}
          onSkip={onDeliveryDone}
        />
      )}
      {showPolicyDialog && (
        <PostBookingPolicyDialog
          open
          onOpenChange={(open) => { if (!open) onPolicyDone(); }}
          forkliftId={postBooking.forkliftId}
          forkliftName={name}
          onSkip={onPolicyDone}
        />
      )}
    </>
  );
}
