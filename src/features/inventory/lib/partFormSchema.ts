import { z } from "zod";

export const partFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  sku: z.string().default(""),
  category: z.string().min(1, "Selecciona una categoría"),
  stock_quantity: z.coerce.number({ error: "Cantidad inválida" }).int("Debe ser entero").min(0, "No puede ser negativo"),
  min_stock_level: z.coerce.number({ error: "Cantidad inválida" }).int("Debe ser entero").min(0, "No puede ser negativo"),
  unit_cost: z.coerce.number({ error: "Costo inválido" }).min(0, "No puede ser negativo"),
});

export type PartFormData = z.infer<typeof partFormSchema>;
