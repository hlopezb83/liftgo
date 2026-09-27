export function deliveryTypeLabel(type: string | null | undefined): string {
  if (type === "delivery") return "Entrega";
  if (type === "pickup") return "Recolección";
  if (type === "return") return "Devolución";
  return "—";
}
