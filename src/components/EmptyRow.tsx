import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Inbox } from "lucide-react";

export const EmptyRow = React.forwardRef<
  HTMLTableRowElement,
  { colSpan: number; message?: string }
>(({ colSpan, message = "No results found" }, ref) => (
  <TableRow ref={ref}>
    <TableCell colSpan={colSpan} className="text-center py-14">
      <div className="flex flex-col items-center gap-2">
        <Inbox className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </TableCell>
  </TableRow>
));

EmptyRow.displayName = "EmptyRow";
