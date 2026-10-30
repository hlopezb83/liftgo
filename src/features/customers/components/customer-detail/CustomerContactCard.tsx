import { EmailIcon, PhoneIcon, Globe, LocationIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { customerWebsiteUrl } from "./customerWebsiteUrl";

interface CustomerContactCardProps {
  customer: Tables<"customers">;
}

export function CustomerContactCard({ customer }: CustomerContactCardProps) {
  const websiteUrl = customer.website ? customerWebsiteUrl(customer.website) : null;
  const rfc = customer.rfc ?? customer.tax_id;
  const hasFiscalData = Boolean(rfc || customer.representante_legal);
  return (
    <Card className="sm:col-span-2">
      <CardHeader><CardTitle className="text-base">Contacto y datos fiscales</CardTitle></CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section aria-label="Contacto" className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contacto</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {customer.contact_person && (
              <div className="min-w-0"><p className="text-xs text-muted-foreground">Persona de Contacto</p><p className="break-words font-medium [overflow-wrap:anywhere]">{customer.contact_person}</p></div>
            )}
            {customer.email && (
              <div className="flex min-w-0 items-start gap-2"><EmailIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><a className="break-all hover:underline focus-visible:underline" href={`mailto:${customer.email}`}>{customer.email}</a></div>
            )}
            {customer.phone && (
              <div className="flex min-w-0 items-start gap-2"><PhoneIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><a className="break-words hover:underline focus-visible:underline" href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}>{customer.phone}</a></div>
            )}
            {customer.website && (
              <div className="flex min-w-0 items-start gap-2"><Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{websiteUrl ? <a className="break-all hover:underline focus-visible:underline" href={websiteUrl} target="_blank" rel="noopener noreferrer">{customer.website}</a> : <span className="break-all">{customer.website}</span>}</div>
            )}
            {customer.address && (
              <div className="flex min-w-0 items-start gap-2 sm:col-span-2"><LocationIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="break-words [overflow-wrap:anywhere]">{customer.address}</span></div>
            )}
          </div>
        </section>
        {hasFiscalData && (
          <section aria-label="Datos fiscales" className="space-y-3 border-t pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datos fiscales</h4>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {rfc && <div className="min-w-0"><dt className="text-xs text-muted-foreground">RFC</dt><dd className="break-words font-medium">{rfc}</dd></div>}
              {customer.representante_legal && <div className="min-w-0"><dt className="text-xs text-muted-foreground">Representante Legal</dt><dd className="break-words font-medium [overflow-wrap:anywhere]">{customer.representante_legal}</dd></div>}
            </dl>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
