import { SwipeableCard } from "@/components/layout/SwipeableCard";
import { Card, CardContent } from "@/components/ui/card";
import { Untranslated } from "@/components/ui/Untranslated";
import { ChevronRightIcon, PhoneIcon } from "@/components/icons";

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
        onAction: () => { window.location.href = `tel:${customer.phone}`; },
      }] : []}
    >
      <Card className="active:scale-[0.98] transition-transform">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <Untranslated className="font-semibold text-sm">{customer.name}</Untranslated>
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          {customer.rfc && <p className="text-xs font-mono text-muted-foreground">{customer.rfc}</p>}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {customer.phone && <span>{customer.phone}</span>}
            {customer.email && <span>{customer.email}</span>}
          </div>
        </CardContent>
      </Card>
    </SwipeableCard>
  );
}
