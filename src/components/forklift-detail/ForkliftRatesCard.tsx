import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import type { Tables } from "@/integrations/supabase/types";

interface ForkliftRatesCardProps {
  forklift: Tables<"forklifts">;
}

export function ForkliftRatesCard({ forklift }: ForkliftRatesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Tarifas de Renta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between"><span className="text-sm text-muted-foreground">Diaria</span><span className="font-semibold">{formatCurrency(forklift.daily_rate || 0)}</span></div>
        <div className="flex justify-between"><span className="text-sm text-muted-foreground">Semanal</span><span className="font-semibold">{formatCurrency(forklift.weekly_rate || 0)}</span></div>
        <div className="flex justify-between"><span className="text-sm text-muted-foreground">Mensual</span><span className="font-semibold">{formatCurrency(forklift.monthly_rate || 0)}</span></div>
      </CardContent>
    </Card>
  );
}
