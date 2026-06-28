import { Badge } from "@/components/ui/badge";

export function RepBadge({ status }: { status: string | null }) {
  const s = status ?? "none";
  if (s === "stamped") return <Badge className="bg-success text-success-foreground hover:bg-success/90">Timbrado</Badge>;
  if (s === "cancelled") return <Badge variant="destructive">Cancelado</Badge>;
  if (s === "error") return <Badge variant="destructive">Error</Badge>;
  if (s === "pending") return <Badge variant="secondary">Pendiente</Badge>;
  return <Badge variant="outline">Sin REP</Badge>;
}
