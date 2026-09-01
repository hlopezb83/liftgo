UPDATE public.bookings
   SET recurring_billing = true
 WHERE booking_number IN ('RSV-0032','RSV-0033')
   AND status NOT IN ('cancelled','completed')
   AND recurring_billing = false;