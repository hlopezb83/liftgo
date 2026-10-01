import { formatMtyDate } from "@/lib/utils";

interface DeliveryDate {
  type?: string;
  status?: string;
  completed_at?: string | null;
}

/** Real delivery can precede the commercial period in historical records. */
export function earliestReturnDate(booking: {
  start_date: string;
  deliveries?: DeliveryDate[];
}): string {
  const dates = booking.deliveries
    ?.filter((delivery) => delivery.type === "delivery" && delivery.status === "completed")
    .map((delivery) => delivery.completed_at)
    .filter((date): date is string => !!date && Number.isFinite(Date.parse(date)))
    .map((date) => formatMtyDate(date, "yyyy-MM-dd"));
  return dates?.length ? dates.sort()[0] : booking.start_date;
}
