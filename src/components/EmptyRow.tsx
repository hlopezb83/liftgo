import { TableRow, TableCell } from "@/components/ui/table";

export function EmptyRow({ colSpan, message = "No results found" }: { colSpan: number; message?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-10">
        {message}
      </TableCell>
    </TableRow>
  );
}
