import { z } from "zod";

export const feedbackFormSchema = z.object({
  type: z.enum(["bug", "improvement"]),
  // FIX R4-30: límites alineados con los CHECK de BD: title 3-300,
  // description 10-5000.
  title: z
    .string()
    .trim()
    .min(3, "Mínimo 3 caracteres")
    .max(300, "Máximo 300 caracteres"),
  description: z
    .string()
    .trim()
    .min(10, "Mínimo 10 caracteres")
    .max(5000, "Máximo 5000 caracteres"),
});

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;
