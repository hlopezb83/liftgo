import { ArrowUpCircle, PlusCircle, Trash2, Clock } from "lucide-react";

export const actionIcon = (action: string) => {
  switch (action) {
    case "INSERT": return <PlusCircle className="h-4 w-4 text-green-600" />;
    case "UPDATE": return <ArrowUpCircle className="h-4 w-4 text-blue-600" />;
    case "DELETE": return <Trash2 className="h-4 w-4 text-destructive" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
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
