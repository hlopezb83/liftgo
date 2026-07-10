import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

interface InvoiceFiscalDataCardProps {
  invoice: Tables<"invoices">;
  extraActions?: ReactNode;
}

const FIELDS: Array<{ key: keyof Tables<"invoices">; label: string }> = [
  { key: "serie", label: "Serie" },
  { key: "folio", label: "Folio" },
  { key: "forma_pago", label: "Forma de Pago" },
  { key: "metodo_pago", label: "Método de Pago" },
  { key: "moneda", label: "Moneda" },
  { key: "uso_cfdi", label: "Uso CFDI" },
];

function FiscalFieldsGrid({ invoice }: { invoice: Tables<"invoices"> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      {FIELDS.map(({ key, label }) => {
        const value = invoice[key];
        if (!value) return null;
        return (
          <div key={key}>
            <span className="text-muted-foreground block">{label}</span>
            {String(value)}
          </div>
        );
      })}
    </div>
  );
}

export function InvoiceFiscalDataCard({ invoice, extraActions }: InvoiceFiscalDataCardProps) {
  const hasContent = Boolean(invoice.serie || invoice.forma_pago || invoice.metodo_pago);
  if (!hasContent && !extraActions) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Datos Fiscales</CardTitle>
        {extraActions ? <div className="flex items-center gap-2">{extraActions}</div> : null}
      </CardHeader>
      <CardContent>
        {hasContent ? (
          <FiscalFieldsGrid invoice={invoice} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Sin datos fiscales adicionales. Usa "Validar contra SAT" para verificar el snapshot del receptor.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
