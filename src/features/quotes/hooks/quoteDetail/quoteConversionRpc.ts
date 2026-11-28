import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Assignment } from "./quoteBookingBuilders";

const convertedBooking = z.object({
  booking_id: z.string(), forklift_id: z.string(), customer_id: z.string().nullable(),
  start_date: z.string(), end_date: z.string(),
});
export type ConvertedBooking = z.infer<typeof convertedBooking>;

export async function convertQuoteBookings(quoteId: string, assignments: Assignment[], recurring: boolean, replacementCustomerId: string | null) {
  const { data, error } = await supabase.rpc("convert_quote_with_customer_scoped", {
    p_quote_id: quoteId,
    p_assignments: assignments.map((assignment) => ({
      forklift_id: assignment.forkliftId,
      daily_rate: assignment.dailyRate,
      weekly_rate: assignment.weeklyRate,
      monthly_rate: assignment.monthlyRate,
    })),
    p_recurring: recurring,
    p_replacement_customer_id: replacementCustomerId ?? undefined,
  });
  if (error) throw error;
  return z.array(convertedBooking).min(1).parse(data);
}
