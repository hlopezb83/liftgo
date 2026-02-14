import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";

export const EmptyRow = React.forwardRef<
  HTMLTableRowElement,
  { colSpan: number; message?: string }
>(({ colSpan, message = "No results found" }, ref) => (
  <TableRow ref={ref}>
    <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-10">
      {message}
    </TableCell>
  </TableRow>
));

EmptyRow.displayName = "EmptyRow";
