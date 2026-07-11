import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, Globe, MapPin } from "@/components/icons";

type SupplierContactInfo = {
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  rfc?: string | null;
  regimen_fiscal?: string | null;
};

const websiteHref = (url: string) => (url.startsWith("http") ? url : `https://${url}`);

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
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Contacto:</span>
              <span className="font-medium">{supplier.contact_person}</span>
            </div>
          )}
          {supplier.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${supplier.email}`} className="text-primary hover:underline">
                {supplier.email}
              </a>
            </div>
          )}
          {supplier.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{supplier.phone}</span>
            </div>
          )}
          {supplier.website && (
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <a
                href={websiteHref(supplier.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {supplier.website}
              </a>
            </div>
          )}
          {supplier.address && (
            <div className="flex items-center gap-2 text-sm sm:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{supplier.address}</span>
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
