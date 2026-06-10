// Customer payment intent status display tokens.

export type PaymentIntentStatus = "pending_review" | "approved" | "rejected";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const PAYMENT_INTENT_STATUS: Record<PaymentIntentStatus, { label: string; variant: BadgeVariant }> = {
  pending_review: { label: "En revisión", variant: "outline" },
  approved: { label: "Aprobado", variant: "default" },
  rejected: { label: "Rechazado", variant: "destructive" },
};
