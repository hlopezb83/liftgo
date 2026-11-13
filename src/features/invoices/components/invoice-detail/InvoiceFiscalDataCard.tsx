import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { FORMA_PAGO, METODO_PAGO, USO_CFDI } from "@/lib/domain/satCatalogs";
import type { ReactNode } from "react";

interface InvoiceFiscalDataCardProps {
  invoice: Tables<"invoices">;
  extraActions?: ReactNode;
}

const FIELDS: Array<{
  key: keyof Tables<"invoices">;
  label: string;
  catalog?: ReadonlyArray<{ code: string; label: string }>;
}> = [
  { key: "serie", label: "Serie" },
  { key: "folio", label: "Folio" },
  { key: "forma_pago", label: "Forma de Pago", catalog: FORMA_PAGO },
  { key: "metodo_pago", label: "Método de Pago", catalog: METODO_PAGO },
  { key: "moneda", label: "Moneda" },
  { key: "uso_cfdi", label: "Uso CFDI", catalog: USO_CFDI },
];

function FiscalFieldsGrid({ invoice }: { invoice: Tables<"invoices"> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
      {FIELDS.map(({ key, label, catalog }) => {
        const value = invoice[key];
        if (!value) return null;
        return (
          <div key={key} className="min-w-0 break-words">
            <span className="text-muted-foreground block">{label}</span>
            {catalog?.find((entry) => entry.code === String(value))?.label ?? String(value)}
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
            Sin datos fiscales adicionales. Usa "Validar contra SAT" para verificar el los datos del receptor guardados en esta factura.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
