import { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTableSelectionToolbarProps {
  count: number;
  onClear: () => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Toolbar contextual que aparece cuando hay filas seleccionadas en un DataTable.
 * Pasarlo vía la prop `selectionToolbar` del DataTable.
 *
 * Ejemplo:
 *   <DataTable
 *     enableRowSelection
 *     selectionToolbar={({ selectedRows, clearSelection }) => (
 *       <DataTableSelectionToolbar count={selectedRows.length} onClear={clearSelection}>
 *         <Button size="sm" onClick={() => markAsPaid(selectedRows)}>Marcar como pagadas</Button>
 *       </DataTableSelectionToolbar>
 *     )}
 *   />
 */
export function DataTableSelectionToolbar({ count, onClear, children, className }: DataTableSelectionToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-primary">{count}</span>
        <span className="text-muted-foreground">{count === 1 ? "fila seleccionada" : "filas seleccionadas"}</span>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8">
          <X className="h-3.5 w-3.5 mr-1" />
          Limpiar
        </Button>
      </div>
    </div>
  );
}
