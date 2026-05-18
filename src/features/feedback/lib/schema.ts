import { z } from "zod";

export const feedbackFormSchema = z.object({
  type: z.enum(["bug", "improvement"]),
  title: z
    .string()
    .trim()
    .min(5, "Mínimo 5 caracteres")
    .max(120, "Máximo 120 caracteres"),
  description: z
    .string()
    .trim()
    .min(10, "Mínimo 10 caracteres")
    .max(2000, "Máximo 2000 caracteres"),
});

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;
