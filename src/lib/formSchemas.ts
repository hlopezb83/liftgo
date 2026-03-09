import { z } from "zod";

// ─── Forklift Form ───────────────────────────────────────────────────────────

export const forkliftFormSchema = z.object({
  name: z.string().min(1, "Nombre es requerido"),
  model: z.string().min(1, "Modelo es requerido"),
  manufacturer: z.string().default(""),
  year: z.string().default(""),
  capacity_kg: z.string().default(""),
  mast_height_m: z.string().default(""),
  fuel_type: z.string().default("Diesel"),
  serial_number: z.string().default(""),
  status: z.string().default("available"),
  daily_rate: z.string().default(""),
  weekly_rate: z.string().default(""),
  monthly_rate: z.string().default(""),
  acquisition_cost: z.string().default(""),
  notes: z.string().default(""),
});

export type ForkliftFormData = z.infer<typeof forkliftFormSchema>;

// ─── Customer Form ───────────────────────────────────────────────────────────

export const customerFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z
    .string()
    .default("")
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Correo electrónico inválido",
    }),
  phone: z.string().default(""),
  address: z.string().default(""),
  notes: z.string().default(""),
  website: z.string().default(""),
  contact_person: z.string().default(""),
  billing_address: z.string().default(""),
  rfc: z.string().default(""),
  regimen_fiscal: z.string().default(""),
  uso_cfdi: z.string().default(""),
  domicilio_fiscal_cp: z.string().default(""),
  representante_legal: z.string().default(""),
});

export type CustomerFormData = z.infer<typeof customerFormSchema>;

// ─── Booking Form ────────────────────────────────────────────────────────────

export const bookingFormSchema = z
  .object({
    forklift_id: z.string().min(1, "Montacargas es requerido"),
    date_range: z.object({
      from: z.date().optional(),
      to: z.date().optional(),
    }).refine((r) => !!r.from, { message: "Fecha de inicio es requerida" })
      .refine((r) => !!r.to, { message: "Fecha de fin es requerida" }),
    customer_id: z.string().default(""),
    customer_name: z.string().default(""),
    customer_contact: z.string().default(""),
    recurring_billing: z.boolean().default(false),
  })
  .refine((d) => {
    if (!d.date_range.from || !d.date_range.to) return true;
    return d.date_range.to >= d.date_range.from;
  }, {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["date_range"],
  });

export type BookingFormInput = z.input<typeof bookingFormSchema>;
export type BookingFormData = z.infer<typeof bookingFormSchema>;

// ─── Expense Form ────────────────────────────────────────────────────────────

export const expenseFormSchema = z.object({
  expense_date: z.date({ required_error: "La fecha es requerida" }),
  amount: z.coerce.number({ invalid_type_error: "Ingresa un monto válido" }).positive("El monto debe ser mayor a 0"),
  category: z.string().min(1, "Selecciona una categoría"),
  description: z.string().default(""),
});

export type ExpenseFormData = z.infer<typeof expenseFormSchema>;

// ─── Part Form ──────────────────────────────────────────────────────────────

export const partFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  sku: z.string().default(""),
  category: z.string().min(1, "Selecciona una categoría"),
  stock_quantity: z.coerce.number({ invalid_type_error: "Cantidad inválida" }).int("Debe ser entero").min(0, "No puede ser negativo"),
  min_stock_level: z.coerce.number({ invalid_type_error: "Cantidad inválida" }).int("Debe ser entero").min(0, "No puede ser negativo"),
  unit_cost: z.coerce.number({ invalid_type_error: "Costo inválido" }).min(0, "No puede ser negativo"),
});

export type PartFormData = z.infer<typeof partFormSchema>;

// ─── Supplier Form ─────────────────────────────────────────────────────────

export const supplierFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  contact_person: z.string().default(""),
  email: z
    .string()
    .default("")
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Correo electrónico inválido",
    }),
  phone: z.string().default(""),
  website: z.string().default(""),
  address: z.string().default(""),
  rfc: z.string().default(""),
  regimen_fiscal: z.string().default(""),
  category: z.string().default(""),
  notes: z.string().default(""),
});

export type SupplierFormData = z.infer<typeof supplierFormSchema>;
