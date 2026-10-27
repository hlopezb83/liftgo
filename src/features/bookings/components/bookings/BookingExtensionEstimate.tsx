import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import type { BookingExtensionPreview } from "../../hooks/bookingActions/useExtendBookingPreview";

function rentalUnit(unit: string, quantity: number): string {
  switch (unit) {
    case "MON": return quantity === 1 ? "mes" : "meses";
    case "WEE": return quantity === 1 ? "semana" : "semanas";
    case "DAY": return quantity === 1 ? "día" : "días";
    default: return quantity === 1 ? "servicio (prorrateo mensual)" : "servicios (prorrateo mensual)";
  }
}

/** The calculated extension lines are shared with billing; this only presents them. */
export function BookingExtensionEstimate({ preview, recurringBilling = false }: { preview: BookingExtensionPreview; recurringBilling?: boolean | null }) {
  const currency = preview.currency.trim().toUpperCase();
  const amount = (value: number) => {
    const formatted = formatCurrencyWithCode(value, currency);
    return formatted.includes(currency) ? formatted : `${formatted} ${currency}`;
  };

  return (
    <section aria-label="Desglose estimado de la extensión" className="min-w-0 rounded-lg border bg-card">
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-medium">Renta adicional</h3>
          <p className="text-xs text-muted-foreground">
            Cálculo con {preview.rateSource === "booking" ? "tarifas pactadas" : "tarifas del catálogo"}
          </p>
        </div>
        <ul className="space-y-3">
          {preview.items.map((item, index) => (
            <li key={index} className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm">
              <div className="min-w-0 flex-1 basis-36">
                <p className="font-medium">{item.quantity} {rentalUnit(item.clave_unidad, item.quantity)}</p>
                <p className="break-words text-xs text-muted-foreground">Tarifa aplicada: {amount(item.unit_price)}</p>
              </div>
              <span className="break-words font-medium tabular-nums">{amount(item.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t pt-3 text-sm">
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="break-words tabular-nums">{amount(preview.subtotal)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">IVA ({preview.taxRate}%)</dt>
            <dd className="break-words tabular-nums">{amount(preview.taxAmount)}</dd>
          </div>
        </dl>
      </div>
      <div className="space-y-1 rounded-b-lg border-t bg-muted/40 p-4">
        <p className="text-sm font-medium">{recurringBilling ? "Total estimado del tramo adicional" : "Total adicional estimado"}</p>
        <p className="break-words text-xl font-semibold tabular-nums sm:text-2xl">{amount(preview.total)}</p>
        <p className="text-xs text-muted-foreground">Esta estimación no es una factura emitida.</p>
      </div>
    </section>
  );
}
