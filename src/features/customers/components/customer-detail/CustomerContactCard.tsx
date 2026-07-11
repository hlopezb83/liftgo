import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailIcon, PhoneIcon, Globe, LocationIcon } from "@/components/icons";
import type { Tables } from "@/integrations/supabase/types";

interface CustomerContactCardProps {
  customer: Tables<"customers">;
}

export function CustomerContactCard({ customer }: CustomerContactCardProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle className="text-base">Información de Contacto</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 text-sm">
        {customer.contact_person && (
          <div><p className="text-xs text-muted-foreground">Persona de Contacto</p><p className="font-medium">{customer.contact_person}</p></div>
        )}
        {customer.representante_legal && (
          <div><p className="text-xs text-muted-foreground">Representante Legal</p><p className="font-medium">{customer.representante_legal}</p></div>
        )}
        {customer.email && (
          <div className="flex items-center gap-2"><EmailIcon className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.email}</span></div>
        )}
        {customer.phone && (
          <div className="flex items-center gap-2"><PhoneIcon className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.phone}</span></div>
        )}
        {customer.website && (
          <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.website}</span></div>
        )}
        {customer.address && (
          <div className="flex items-center gap-2"><LocationIcon className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.address}</span></div>
        )}
        {customer.tax_id && (
          <div><p className="text-xs text-muted-foreground">RFC</p><p className="font-medium">{customer.tax_id}</p></div>
        )}
      </CardContent>
    </Card>
  );
}
