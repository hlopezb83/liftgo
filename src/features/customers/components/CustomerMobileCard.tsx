import { SwipeableCard } from "@/components/feedback/SwipeableCard";
import { ChevronRightIcon, PhoneIcon } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { Untranslated } from "@/components/ui/Untranslated";

interface CustomerCardData {
  id: string;
  name: string;
  rfc: string | null;
  phone: string | null;
  email: string | null;
}

interface Props {
  customer: CustomerCardData;
  onOpen: (id: string) => void;
}

/** Tarjeta móvil del listado de clientes (extraída de CustomersPage). */
export function CustomerMobileCard({ customer, onOpen }: Props) {
  return (
    <SwipeableCard
      onClick={() => onOpen(customer.id)}
      rightActions={customer.phone ? [{
        label: "Llamar",
        icon: PhoneIcon,
        className: "bg-primary",
        onAction: () => { globalThis.location.assign(`tel:${customer.phone}`); },
      }] : []}
    >
      <Card className="active:scale-[0.98] transition-transform">
        <CardContent className="p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <Untranslated className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">{customer.name}</Untranslated>
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          {customer.rfc && <p className="text-xs font-mono text-muted-foreground">{customer.rfc}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {customer.phone && <span className="min-w-0 [overflow-wrap:anywhere]">{customer.phone}</span>}
            {customer.email && <span className="min-w-0 [overflow-wrap:anywhere]">{customer.email}</span>}
          </div>
        </CardContent>
      </Card>
    </SwipeableCard>
  );
}
