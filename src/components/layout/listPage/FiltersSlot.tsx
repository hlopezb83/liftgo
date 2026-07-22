import { FilterIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ReactNode } from "react";

interface Props {
  filters: ReactNode;
  inSheet: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function FiltersSlot({ filters, inSheet, open, onOpenChange }: Props) {
  if (!filters) return null;
  if (!inSheet) return <>{filters}</>;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="touch:h-11 w-auto justify-start gap-2">
          <FilterIcon className="h-4 w-4" />
          Filtros
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">{filters}</div>
      </SheetContent>
    </Sheet>
  );
}
