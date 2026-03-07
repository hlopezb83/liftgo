

## Strengthening Form Schemas with Zod

### Current State
Forms use plain object literals (e.g., `emptyForm`, `emptyCustomer`) with `useFormState` — no Zod validation. Field types are all strings, and validation happens manually in `handleSubmit` with ad-hoc checks.

### Plan

**New file: `src/lib/formSchemas.ts`** — Central Zod schemas for each form.

**Schemas to create:**

1. **`forkliftFormSchema`** — name (required), model (required), manufacturer, year (coerced number), capacity_kg, mast_height_m, fuel_type, serial_number, status, daily_rate, weekly_rate, monthly_rate, notes
2. **`customerFormSchema`** — name (required), email (email or empty), phone, address, notes, website, contact_person, billing_address, rfc, regimen_fiscal, uso_cfdi, domicilio_fiscal_cp, representante_legal
3. **`bookingFormSchema`** — forklift_id (required), start_date (required), end_date (required), customer_id, customer_name, customer_contact, recurring_billing

**Refactor pattern for each form:**

```typescript
// formSchemas.ts
export const forkliftFormSchema = z.object({
  name: z.string().min(1, "Nombre es requerido"),
  model: z.string().min(1, "Modelo es requerido"),
  year: z.string().optional(),
  // ...
});
export type ForkliftFormData = z.infer<typeof forkliftFormSchema>;

// ForkliftForm.tsx
import { forkliftFormSchema, type ForkliftFormData } from "@/lib/formSchemas";

const emptyForm: ForkliftFormData = { ... };

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const result = forkliftFormSchema.safeParse(form);
  if (!result.success) {
    toast.error(result.error.issues[0].message);
    return;
  }
  // use result.data (typed & validated)
};
```

### Files to modify
- **Create** `src/lib/formSchemas.ts` — 3 Zod schemas + inferred types
- **Edit** `src/pages/ForkliftForm.tsx` — type form with schema, validate on submit
- **Edit** `src/pages/CustomersPage.tsx` — type form with schema, validate on submit
- **Edit** `src/pages/BookingForm.tsx` — type form with schema, validate on submit

### Benefits
- Single source of truth for field constraints
- Changing a field from optional to required flags all consumers at compile time via `z.infer`
- Structured error messages replace scattered `toast.error` calls

