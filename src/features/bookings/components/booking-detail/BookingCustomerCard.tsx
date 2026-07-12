import { InfoRow } from "@/components/forms/InfoRow";
import { UserIcon, PhoneIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  customerName?: string | null;
  customerContact?: string | null;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
}

export function BookingCustomerCard({ customerName, customerContact, siteContactName, siteContactPhone }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" /> Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Nombre" value={customerName || "—"} />
        <InfoRow label="Contacto" value={customerContact || "—"} />
        {siteContactName && <InfoRow label="Contacto en sitio" value={siteContactName} />}
        {siteContactPhone && (
          <InfoRow
            label={<span className="flex items-center gap-1"><PhoneIcon className="h-3 w-3" /> Tel. sitio</span>}
            value={siteContactPhone}
          />
        )}
      </CardContent>
    </Card>
  );
}
