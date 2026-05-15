import { z } from "zod";
import { FEEDBACK_INTERNAL_MODULES, FEEDBACK_PORTAL_MODULES } from "./constants";

const allModules = [...FEEDBACK_INTERNAL_MODULES, ...FEEDBACK_PORTAL_MODULES] as const;

export const feedbackFormSchema = z.object({
  type: z.enum(["bug", "improvement"]),
  module: z.enum(allModules as unknown as [string, ...string[]]),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
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
