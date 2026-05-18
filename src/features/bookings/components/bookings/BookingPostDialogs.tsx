import { PostBookingDeliveryDialog } from "@/features/bookings/components/bookings/PostBookingDeliveryDialog";
import { PostBookingPolicyDialog } from "@/features/bookings/components/bookings/PostBookingPolicyDialog";

type PostBooking = {
  bookingId: string;
  forkliftId: string;
  startDate: string;
  customerAddress?: string | null;
};

interface Props {
  postBooking: PostBooking | null;
  showPolicyDialog: boolean;
  forkliftName: string;
  onDeliveryDone: () => void;
  onPolicyDone: () => void;
}

export function BookingPostDialogs({ postBooking, showPolicyDialog, forkliftName, onDeliveryDone, onPolicyDone }: Props) {
  if (!postBooking) return null;
  const showDelivery = !showPolicyDialog;
  return (
    <>
      {showDelivery && (
        <PostBookingDeliveryDialog
          open
          onOpenChange={(open) => { if (!open) onDeliveryDone(); }}
          bookingId={postBooking.bookingId}
          forkliftId={postBooking.forkliftId}
          forkliftName={forkliftName}
          startDate={postBooking.startDate}
          customerAddress={postBooking.customerAddress}
          onSkip={onDeliveryDone}
        />
      )}
      {showPolicyDialog && (
        <PostBookingPolicyDialog
          open
          onOpenChange={(open) => { if (!open) onPolicyDone(); }}
          forkliftId={postBooking.forkliftId}
          forkliftName={forkliftName}
          onSkip={onPolicyDone}
        />
      )}
    </>
  );
}
