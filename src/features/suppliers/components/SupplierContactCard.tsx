import { EmailIcon, PhoneIcon, Globe, LocationIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SupplierContactInfo = {
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  rfc?: string | null;
  regimen_fiscal?: string | null;
};

const websiteHref = (url: string): string | null => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};

export function SupplierContactCard({ supplier }: { supplier: SupplierContactInfo }) {
  const hasFiscal = Boolean(supplier.rfc || supplier.regimen_fiscal);
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Información de Contacto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {supplier.contact_person && (
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-muted-foreground shrink-0">Contacto:</span>
              <span className="font-medium truncate">{supplier.contact_person}</span>
            </div>
          )}
          {supplier.email && (
            <div className="flex items-center gap-2 text-sm min-w-0">
              <EmailIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${supplier.email}`} className="text-primary hover:underline break-all">
                {supplier.email}
              </a>
            </div>
          )}
          {supplier.phone && (
            <div className="flex items-center gap-2 text-sm min-w-0">
              <PhoneIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <a className="break-words hover:underline focus-visible:underline" href={`tel:${supplier.phone.replace(/[^\d+]/g, "")}`}>{supplier.phone}</a>
            </div>
          )}
          {supplier.website && (
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              {websiteHref(supplier.website) ? (
                <a
                  href={websiteHref(supplier.website) as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {supplier.website}
                </a>
              ) : (
                <span className="break-all">{supplier.website}</span>
              )}
            </div>
          )}
          {supplier.address && (
            <div className="flex items-start gap-2 text-sm sm:col-span-2 min-w-0">
              <LocationIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span className="break-words">{supplier.address}</span>
            </div>
          )}
        </div>
        {hasFiscal && (
          <div className="border-t pt-3 mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Datos Fiscales</p>
            <div className="flex gap-4 text-sm">
              {supplier.rfc && (
                <span>
                  <span className="text-muted-foreground">RFC:</span>{" "}
                  <span className="font-mono">{supplier.rfc}</span>
                </span>
              )}
              {supplier.regimen_fiscal && (
                <span>
                  <span className="text-muted-foreground">Régimen:</span> {supplier.regimen_fiscal}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
