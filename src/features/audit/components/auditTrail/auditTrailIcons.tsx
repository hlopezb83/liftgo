import { ArrowUpCircle, PlusCircle, DeleteIcon, ClockIcon } from "@/components/icons";

export const actionIcon = (action: string) => {
  switch (action) {
    case "INSERT": return <PlusCircle className="h-4 w-4 text-success" />;
    case "UPDATE": return <ArrowUpCircle className="h-4 w-4 text-info" />;
    case "DELETE": return <DeleteIcon className="h-4 w-4 text-destructive" />;
    default: return <ClockIcon className="h-4 w-4 text-muted-foreground" />;
  }
};

export const actionBadgeVariant = (action: string) => {
  switch (action) {
    case "INSERT": return "default" as const;
    case "UPDATE": return "secondary" as const;
    case "DELETE": return "destructive" as const;
    default: return "outline" as const;
  }
};
