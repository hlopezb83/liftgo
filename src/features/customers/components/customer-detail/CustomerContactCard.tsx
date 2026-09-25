import { EmailIcon, PhoneIcon, Globe, LocationIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { customerWebsiteUrl } from "./customerWebsiteUrl";

interface CustomerContactCardProps {
  customer: Tables<"customers">;
}

export function CustomerContactCard({ customer }: CustomerContactCardProps) {
  const websiteUrl = customer.website ? customerWebsiteUrl(customer.website) : null;
  return (
    <Card className="sm:col-span-2">
      <CardHeader><CardTitle className="text-base">Información de Contacto</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        {customer.contact_person && (
          <div><p className="text-xs text-muted-foreground">Persona de Contacto</p><p className="font-medium">{customer.contact_person}</p></div>
        )}
        {customer.representante_legal && (
          <div><p className="text-xs text-muted-foreground">Representante Legal</p><p className="font-medium">{customer.representante_legal}</p></div>
        )}
        {customer.email && (
          <div className="flex items-center gap-2"><EmailIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><a className="break-all hover:underline focus-visible:underline" href={`mailto:${customer.email}`}>{customer.email}</a></div>
        )}
        {customer.phone && (
          <div className="flex items-center gap-2"><PhoneIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><a className="hover:underline focus-visible:underline" href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}>{customer.phone}</a></div>
        )}
        {customer.website && (
          <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{websiteUrl ? <a className="break-all hover:underline focus-visible:underline" href={websiteUrl} target="_blank" rel="noopener noreferrer">{customer.website}</a> : <span>{customer.website}</span>}</div>
        )}
        {customer.address && (
          <div className="flex items-start gap-2"><LocationIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span>{customer.address}</span></div>
        )}
        {(customer.rfc ?? customer.tax_id) && (
          <div><p className="text-xs text-muted-foreground">RFC</p><p className="font-medium">{customer.rfc ?? customer.tax_id}</p></div>
        )}
      </CardContent>
    </Card>
  );
}
