import React from "react";
import { Inbox } from "@/components/icons";
import { TableRow, TableCell } from "@/components/ui/table";

export const EmptyRow = ({ colSpan, message = "Sin resultados", ref }: { colSpan: number; message?: string } & { ref?: React.Ref<HTMLTableRowElement> }) => {
  return (
    <TableRow ref={ref}>
    <TableCell colSpan={colSpan} className="text-center py-14">
      <div className="flex flex-col items-center gap-2">
        <Inbox className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </TableCell>
  </TableRow>
  );
};

EmptyRow.displayName = "EmptyRow";
