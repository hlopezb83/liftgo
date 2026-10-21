import { z } from "zod";
import { toYMD } from "@/lib/date/toYMD";
import type { BookingFormData } from "./bookingFormSchema";

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && toYMD(date) === value;
});
const referenceId = z.union([z.literal(""), z.uuid()]);
// Explicit allowlist. Free-form name/contact stay in memory, never localStorage.
export const bookingDraftSchema = z.object({
  forklift_id: referenceId,
  customer_id: referenceId,
  from: civilDate.optional(),
  to: civilDate.optional(),
  recurring_billing: z.boolean(),
}).strict();
export type BookingDraftValues = z.infer<typeof bookingDraftSchema>;
export const emptyBookingForm = (): BookingFormData => ({
  forklift_id: "", customer_id: "", customer_name: "", customer_contact: "",
  date_range: { from: undefined, to: undefined }, recurring_billing: false,
});
export const toBookingDraft = (data: BookingFormData): BookingDraftValues => ({
  forklift_id: data.forklift_id, customer_id: data.customer_id,
  from: toYMD(data.date_range?.from), to: toYMD(data.date_range?.to),
  recurring_billing: Boolean(data.recurring_billing),
});
export const restoreBookingDraft = (values: BookingDraftValues): BookingFormData => ({
  ...emptyBookingForm(), forklift_id: values.forklift_id, customer_id: values.customer_id,
  // Civil dates, not UTC instants: no timezone shift on reload.
  date_range: { from: values.from ? new Date(`${values.from}T12:00:00`) : undefined, to: values.to ? new Date(`${values.to}T12:00:00`) : undefined },
  recurring_billing: values.recurring_billing,
});
export const bookingFormHasChanges = (data: BookingFormData) => Boolean(
  data.forklift_id || data.customer_id || data.customer_name || data.customer_contact ||
  data.date_range?.from || data.date_range?.to || data.recurring_billing,
);
export const hasRecoverableBookingFields = (data: BookingDraftValues) => Boolean(
  data.forklift_id || data.customer_id || data.from || data.to || data.recurring_billing,
);
