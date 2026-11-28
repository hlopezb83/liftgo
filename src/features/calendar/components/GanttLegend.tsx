import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface GanttLegendProps {
  customerColorMap: Map<string, string>;
}

function LegendSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3 pt-3 border-t">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        {open ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
        {title}
        {typeof count === "number" && <span>({count})</span>}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-3 mt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GanttLegend({ customerColorMap }: GanttLegendProps) {
  const hasCustomers = customerColorMap.size > 0;

  return (
    <div className="mt-4">
      <LegendSection title="Leyenda">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-5 h-3 rounded-sm bg-[hsl(var(--gantt-1))]" />
          <span>Confirmada</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-5 h-3 rounded-sm bg-[hsl(var(--gantt-1))] opacity-30 border border-dashed border-foreground/30" />
          <span>Completada / Cancelada</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-5 h-3 rounded-sm bg-muted/60 border border-border" />
          <span>Fin de semana</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-px h-4 bg-primary/70 mx-2" />
          <span>Hoy</span>
        </div>
      </LegendSection>

      {hasCustomers && (
        <LegendSection title="Leyenda de clientes" count={customerColorMap.size}>
          {Array.from(customerColorMap.entries()).map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
              <span>{name}</span>
            </div>
          ))}
        </LegendSection>
      )}
    </div>
  );
}
