import { z } from "zod";

export const expenseFormSchema = z.object({
  expense_date: z.date({ required_error: "La fecha es requerida" }),
  amount: z.coerce.number({ invalid_type_error: "Ingresa un monto válido" }).positive("El monto debe ser mayor a 0"),
  category: z.string().min(1, "Selecciona una categoría"),
  description: z.string().default(""),
});

export type ExpenseFormData = z.infer<typeof expenseFormSchema>;
