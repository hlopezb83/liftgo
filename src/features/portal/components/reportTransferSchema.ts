import { z } from "zod";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { positiveAmount } from "@/lib/schemas";

// Bloque 3.4 (R4): el monto debe ser > 0 y ≤ saldo pendiente. Antes se podía
// reportar una transferencia mayor al saldo, lo que confundía al admin al
// revisar el intent.
// R9-P2: el mensaje ahora dice CUÁL es el saldo (antes el botón sólo se
// deshabilitaba y el cliente no sabía por qué).
export const makeSchema = (balance: number) => z.object({
  transferDate: z.date({ error: "La fecha es obligatoria" }),
  amount: positiveAmount().refine(
    (v) => Number(v) <= Number(balance.toFixed(2)) + 0.005,
    { message: `El monto no puede superar el saldo pendiente (${formatCurrency(balance)})` },
  ),
  senderBank: z.string().default(""),
  senderLast4: z
    .string()
    .default("")
    .refine((v) => !v || /^\d{4}$/.test(v), { message: "Debe ser 4 dígitos" }),
  trackingKey: z.string().default(""),
  proofFile: z
    .custom<File | null>((v) => v === null || v instanceof File, { message: "Archivo inválido" })
    .nullable()
    .default(null),
});

export type ReportTransferFormValues = z.input<ReturnType<typeof makeSchema>>;
