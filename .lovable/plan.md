
# Calendar Module Improvements

## Overview
The calendar page currently has several usability gaps: the Gantt chart lacks a color legend and day-of-week context, booking bars don't show customer names inline, there's no status filtering, the "All Bookings" list shows raw date strings instead of formatted dates, and there's no way to filter by status or quickly navigate to create a new booking. This plan addresses all of these.

## Changes

### 1. Add a "New Booking" Button to the Page Header
Currently there's no obvious way to create a booking from the calendar page itself. Add a CTA button in the `PageHeader` action slot linking to `/bookings/new`.

**File:** `src/pages/CalendarPage.tsx`

---

### 2. Day-of-Week Headers on the Gantt Chart
The current day row only shows the day number (1, 2, 3...). Add a secondary row or modify the existing one to also show the abbreviated weekday (Mon, Tue...) and highlight weekends with a subtle background tint so users can quickly orient themselves.

**File:** `src/pages/CalendarPage.tsx`

---

### 3. Today Indicator on the Gantt Chart
Highlight the current day's column with a subtle vertical accent (e.g., a different background or a top border) so users can immediately see where "today" falls in the timeline.

**File:** `src/pages/CalendarPage.tsx`

---

### 4. Color Legend
The colored booking bars use different colors per forklift row, but there's no legend explaining what each color means. Add a small legend strip below the Gantt chart header showing the color-to-customer mapping for visible bookings in the current month.

**File:** `src/pages/CalendarPage.tsx`

---

### 5. Tooltip on Booking Bars
Currently hovering over a bar only shows an HTML `title` attribute (plain tooltip). Replace this with a proper styled tooltip using the existing `Tooltip` component showing customer name, dates, and duration.

**File:** `src/pages/CalendarPage.tsx`

---

### 6. Status Filter Tabs on the Bookings List
The "All Bookings" section at the bottom shows every booking regardless of status. Add filter tabs (All / Confirmed / Completed / Cancelled) so users can quickly narrow down the list.

**File:** `src/pages/CalendarPage.tsx`

---

### 7. Formatted Dates in Bookings List
The bookings list shows raw ISO strings like `2025-01-15`. Format these to a human-friendly format like `Jan 15, 2025` and show the booking duration in days.

**File:** `src/pages/CalendarPage.tsx`

---

### 8. Show Cancelled Bookings in Gantt (Dimmed)
Currently only `confirmed` bookings appear on the Gantt. Show `cancelled` and `completed` bookings as well but with reduced opacity so users have full context of the timeline.

**File:** `src/pages/CalendarPage.tsx`

---

## Technical Details

All changes are confined to `src/pages/CalendarPage.tsx`. No database or backend changes needed.

Key implementation notes:
- Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip` for rich hover cards on booking bars
- Import `Tabs`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs` for the status filter
- Import `isToday`, `getDay` from `date-fns` for weekend detection and today highlighting
- Import `Link` from `react-router-dom` and `Plus` from `lucide-react` for the new booking button
- Color assignment will change from per-forklift-index to per-booking-id (hash-based) so the legend can map colors to customer names
- Booking bars for non-confirmed statuses will render at `opacity-30` with a dashed border pattern

## Summary of Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/pages/CalendarPage.tsx` | All 8 improvements above |
