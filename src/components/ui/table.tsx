import * as React from "react";

import { cn } from "@/lib/utils";

const Table = ({ className, ref, ...props }: React.HTMLAttributes<HTMLTableElement> & { ref?: React.Ref<HTMLTableElement> }) => {
  return (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
};
Table.displayName = "Table";

const TableHeader = ({ className, ref, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }) => {
  return (
    <thead ref={ref} className={cn("sticky top-0 z-10 bg-card [&_tr]:border-b-2 [&_tr]:border-border", className)} {...props} />
  );
};
TableHeader.displayName = "TableHeader";

const TableBody = ({ className, ref, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }) => {
  return (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
};
TableBody.displayName = "TableBody";

const TableFooter = ({ className, ref, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }) => {
  return (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  );
};
TableFooter.displayName = "TableFooter";

const TableRow = ({ className, ref, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { ref?: React.Ref<HTMLTableRowElement> }) => {
  return (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50 even:bg-muted/30", className)}
      {...props}
    />
  );
};
TableRow.displayName = "TableRow";

const TableHead = ({ className, ref, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { ref?: React.Ref<HTMLTableCellElement> }) => {
  return (
    <th
      ref={ref}
      className={cn(
        "h-9 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
};
TableHead.displayName = "TableHead";

const TableCell = ({ className, ref, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { ref?: React.Ref<HTMLTableCellElement> }) => {
  return (
    <td ref={ref} className={cn("px-3 py-2 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  );
};
TableCell.displayName = "TableCell";

const TableCaption = ({ className, ref, ...props }: React.HTMLAttributes<HTMLTableCaptionElement> & { ref?: React.Ref<HTMLTableCaptionElement> }) => {
  return (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  );
};
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
