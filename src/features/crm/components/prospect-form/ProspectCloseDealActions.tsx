import { CheckCircle2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import type { Prospect } from "@/features/crm/hooks/useProspects";

interface Props {
  prospect: Prospect;
  canCloseDeal: boolean;
  onClose: () => void;
}

export function ProspectCloseDealActions({ prospect, canCloseDeal, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border border-dashed p-3">
      {!canCloseDeal ? (
        <p className="text-xs text-muted-foreground text-center">
          Solo usuarios administrativos pueden convertir prospectos a clientes
        </p>
      ) : prospect.customer_id ? (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">Cliente creado</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="ml-auto p-0 h-auto"
            onClick={() => navigate(`/customers/${prospect.customer_id}`)}
          >
            Ver cliente
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={() => {
            const params = new URLSearchParams({
              from_prospect: "true",
              prospect_id: prospect.id,
              company: prospect.company_name,
              contact: prospect.contact_person || "",
              email: prospect.email || "",
              phone: prospect.phone || "",
            });
            onClose();
            navigate(`/customers?${params.toString()}`);
          }}
        >
          <UserPlus className="h-4 w-4" />
          Convertir a Cliente
        </Button>
      )}
    </div>
  );
}
