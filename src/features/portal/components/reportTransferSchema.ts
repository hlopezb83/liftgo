import { z } from "zod";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { positiveAmount } from "@/lib/schemas";

// Bloque 3.4 (R4): el monto debe ser > 0 y ≤ saldo pendiente. Antes se podía
// reportar una transferencia mayor al saldo, lo que confundía al admin al
// revisar el intent.
// R9-P2: el mensaje ahora dice CUÁL es el saldo (antes el botón sólo se
// deshabilitaba y el cliente no sabía por qué).
// FIX-FE-04: se valida contra el remanente descontando intents pending_review;
// sin esto el cliente podía sobre-reportar y generar intents duplicados que al
// aprobarse sobrepagaban la factura.
export const makeSchema = (reportableBalance: number, pendingInReview = 0) => z.object({
  // SEC-M2: la fecha no puede ser futura ni más de 60 días en el pasado —
  // una transferencia SPEI se reporta en su momento; fechas absurdas dificultan
  // la conciliación. Mismo patrón de refine que EditPaymentDialog.
  transferDate: z.date({ error: "La fecha es obligatoria" })
    .refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, {
      message: "La fecha de la transferencia no puede ser futura.",
    })
    .refine((d) => d.getTime() >= Date.now() - 60 * 24 * 60 * 60 * 1000, {
      message: "La fecha de la transferencia no puede tener más de 60 días de antigüedad.",
    }),
  amount: positiveAmount().refine(
    (v) => Number(v) <= Number(reportableBalance.toFixed(2)) + 0.005,
    {
      message: pendingInReview > 0
        ? `El monto no puede superar el saldo reportable (${formatCurrency(reportableBalance)}). Ya tienes ${formatCurrency(pendingInReview)} en revisión.`
        : `El monto no puede superar el saldo pendiente (${formatCurrency(reportableBalance)})`,
    },
  ),
  senderBank: z.string().max(100, "Máximo 100 caracteres").default(""),
  senderLast4: z
    .string()
    .default("")
    .refine((v) => !v || /^\d{4}$/.test(v), { message: "Debe ser 4 dígitos" }),
  trackingKey: z.string().max(30, "Máximo 30 caracteres").default(""),
  proofFile: z
    .custom<File | null>((v) => v === null || v instanceof File, { message: "Archivo inválido" })
    .refine((f) => f === null || f.size <= 5 * 1024 * 1024, "El comprobante no puede exceder 5 MB")
    .refine(
      (f) => f === null || ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(f.type),
      "Formato no permitido (PDF, PNG, JPG o WebP)",
    )
    .nullable()
    .default(null),
});

export type ReportTransferFormValues = z.input<ReturnType<typeof makeSchema>>;
