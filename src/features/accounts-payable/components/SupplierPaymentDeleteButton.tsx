import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  canDelete: boolean;
  deleteBlocked: string | null;
  isPending: boolean;
  onClick: () => void;
}

export function SupplierPaymentDeleteButton({ canDelete, deleteBlocked, isPending, onClick }: Props) {
  return (
    <div className="pt-1 flex justify-end">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={!canDelete || isPending}
                onClick={onClick}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Eliminar pago
              </Button>
            </span>
          </TooltipTrigger>
          {deleteBlocked && <TooltipContent>{deleteBlocked}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
