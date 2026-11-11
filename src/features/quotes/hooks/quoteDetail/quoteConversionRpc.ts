import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Assignment } from "./quoteBookingBuilders";

const convertedBooking = z.object({
  booking_id: z.string(), forklift_id: z.string(), customer_id: z.string().nullable(),
  start_date: z.string(), end_date: z.string(),
});
export type ConvertedBooking = z.infer<typeof convertedBooking>;

type ConversionArgs = {
  p_quote_id: string;
  p_assignments: { forklift_id: string; daily_rate: number; weekly_rate: number; monthly_rate: number }[];
  p_recurring: boolean;
  p_replacement_customer_id: string | null;
};
type ConversionRpc = (name: "convert_quote_with_customer_scoped", args: ConversionArgs) => PromiseLike<{
  data: unknown; error: { message: string } | null;
}>;

export async function convertQuoteBookings(quoteId: string, assignments: Assignment[], recurring: boolean, replacementCustomerId: string | null) {
  const rpc = supabase.rpc.bind(supabase) as unknown as ConversionRpc;
  const { data, error } = await rpc("convert_quote_with_customer_scoped", {
    p_quote_id: quoteId,
    p_assignments: assignments.map((assignment) => ({
      forklift_id: assignment.forkliftId,
      daily_rate: assignment.dailyRate,
      weekly_rate: assignment.weeklyRate,
      monthly_rate: assignment.monthlyRate,
    })),
    p_recurring: recurring,
    p_replacement_customer_id: replacementCustomerId,
  });
  if (error) throw error;
  return z.array(convertedBooking).min(1).parse(data);
}
