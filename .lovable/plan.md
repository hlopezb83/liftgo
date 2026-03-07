

## Wire Zod into react-hook-form for BookingForm — Inline Field Errors

### Context
The project already has `react-hook-form`, `@hookform/resolvers`, and Shadcn's `Form`/`FormField`/`FormMessage` components installed but unused. Currently no form uses `useForm()`. BookingForm uses manual `useState` + `safeParse` with toast errors.

### Approach
Refactor `BookingForm.tsx` to use `react-hook-form` with `zodResolver(bookingFormSchema)`, replacing individual `useState` calls with a single form instance. Validation errors will appear inline under each field via `FormMessage` instead of toast popups.

### Changes

**1. Update `src/lib/formSchemas.ts`**
- Adjust `bookingFormSchema` so `start_date` and `end_date` accept `Date | undefined` and use `.refine()` to check they're defined (since react-hook-form needs a default value). Add `customer_id`, `customer_name`, `customer_contact` as optional strings.

**2. Refactor `src/pages/BookingForm.tsx`**
- Replace 5 `useState` calls (`forkliftId`, `customerId`, `customerName`, `customerContact`, `recurringBilling`, `dateRange`) with `useForm({ resolver: zodResolver(bookingFormSchema), defaultValues: {...} })`
- Wrap form fields in `FormField` + `FormItem` + `FormControl` + `FormMessage` from Shadcn
- Remove manual `safeParse` call — react-hook-form handles validation automatically on submit
- Keep `postBooking` state and `PostBookingDeliveryDialog` logic unchanged

**3. Update child components to accept react-hook-form's `field` props**
- `DateRangePickerField`: add optional `error?: string` prop to show inline error
- `ForkliftSelector`: add optional `error?: string` prop
- `CustomerSelector`: add optional `error?: string` prop
- These components will render a `<p className="text-sm text-destructive">` when error is present

### Result
Validation errors appear directly under the relevant field (e.g., "Montacargas es requerido" under the forklift dropdown) instead of as a toast. This is the standard Shadcn + react-hook-form pattern.

### Scope
- 1 schema update
- 1 form refactor
- 3 child components get optional `error` prop
- No database changes

