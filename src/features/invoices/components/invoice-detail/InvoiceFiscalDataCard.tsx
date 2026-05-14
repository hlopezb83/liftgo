import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

interface InvoiceFiscalDataCardProps {
  invoice: Tables<"invoices">;
}

export function InvoiceFiscalDataCard({ invoice }: InvoiceFiscalDataCardProps) {
  if (!invoice.serie && !invoice.forma_pago && !invoice.metodo_pago) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Datos Fiscales</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {invoice.serie && <div><span className="text-muted-foreground block">Serie</span>{invoice.serie}</div>}
          {invoice.folio && <div><span className="text-muted-foreground block">Folio</span>{invoice.folio}</div>}
          {invoice.forma_pago && <div><span className="text-muted-foreground block">Forma de Pago</span>{invoice.forma_pago}</div>}
          {invoice.metodo_pago && <div><span className="text-muted-foreground block">Método de Pago</span>{invoice.metodo_pago}</div>}
          {invoice.moneda && <div><span className="text-muted-foreground block">Moneda</span>{invoice.moneda}</div>}
          {invoice.uso_cfdi && <div><span className="text-muted-foreground block">Uso CFDI</span>{invoice.uso_cfdi}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
