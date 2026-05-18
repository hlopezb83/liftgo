import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { FUEL_TYPE_LABELS } from "@/lib/constants";
import type { Forklift } from "@/features/fleet/hooks/forklifts/useForklifts";

interface CardProps {
  forklift: Forklift;
  hasActivePolicy: boolean;
  onClick: () => void;
}

export function FleetMobileCard({ forklift: f, hasActivePolicy, onClick }: CardProps) {
  return (
    <Card className="cursor-pointer active:scale-[0.98] transition-transform" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono font-semibold text-sm flex items-center gap-1.5">
            {f.name}
            {hasActivePolicy && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
          </span>
          <StatusBadge status={f.status} />
        </div>
        <p className="text-sm text-muted-foreground">{f.model}</p>
        {f.serial_number && <p className="text-xs text-muted-foreground font-mono">S/N: {f.serial_number}</p>}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex gap-4 text-xs text-muted-foreground">
            {f.fuel_type && <span>{FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type}</span>}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

interface RowProps {
  forklift: Forklift;
  hasActivePolicy: boolean;
  location: string;
  onClick: () => void;
}

export function FleetTableRow({ forklift: f, hasActivePolicy, location, onClick }: RowProps) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors border-l-2 border-transparent hover:border-primary" onClick={onClick}>
      <TableCell className="font-mono font-medium">
        <span className="flex items-center gap-1.5">
          {f.name}
          {hasActivePolicy && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent>Póliza de mantenimiento activa</TooltipContent>
            </Tooltip>
          )}
        </span>
      </TableCell>
      <TableCell>{f.model}</TableCell>
      <TableCell className="font-mono text-xs">{f.serial_number || "—"}</TableCell>
      <TableCell>{f.fuel_type ? (FUEL_TYPE_LABELS[f.fuel_type] || f.fuel_type) : "—"}</TableCell>
      <TableCell><StatusBadge status={f.status} /></TableCell>
      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{location || "—"}</TableCell>
    </TableRow>
  );
}
