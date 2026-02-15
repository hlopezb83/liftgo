
# Fix: Allow Booking Creation from Accepted Quotes

## The Problem

The "Convert to Booking" and "Convert to Invoice" buttons on the Quote Detail page only appear when the quote status is `draft` or `sent`. Once you click "Accept", the status changes to `accepted` and those action buttons vanish -- even though accepting a quote is the natural moment to convert it into a booking.

## The Fix

In `src/pages/QuoteDetail.tsx`, expand the condition on line 95 to also include the `"accepted"` status:

```
Before:  quote.status === "draft" || quote.status === "sent"
After:   quote.status === "draft" || quote.status === "sent" || quote.status === "accepted"
```

This ensures that after accepting a quote, the user can still convert it to a booking or invoice. The buttons will only disappear once the quote reaches a terminal state like `"declined"`.

## Files to Modify

- **`src/pages/QuoteDetail.tsx`** -- One line change to the status condition (line 95)
