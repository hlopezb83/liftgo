import { Badge } from "@/components/ui/badge";
import type { AccountingBasis } from "../../../hooks/incomeStatement/types";

/** Presentation only. The recognition rules come from get_income_statement. */
export function IncomeStatementBasisNote({ accountingBasis }: { accountingBasis: AccountingBasis }) {
  const isCash = accountingBasis === "cash";

  return (
    <section aria-label="Moneda, IVA y fechas del reporte" className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
      <p><strong>Reporte gerencial.</strong> No sustituye la contabilidad oficial.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase tracking-wide">Base contable:</span>
        <Badge variant={isCash ? "secondary" : "default"}>{isCash ? "Efectivo" : "Devengado"}</Badge>
        <span><strong>Moneda:</strong> MXN (pesos mexicanos).</span>
      </div>
      <p>
        <strong>Fechas:</strong>{" "}
        {isCash
          ? "Facturas por fecha de cobro y proveedores por fecha de pago. Las demás partidas conservan sus fechas propias, indicadas en el detalle. No equivale a una conciliación bancaria."
          : "Facturas por fecha de emisión. Proveedores por fecha de emisión o prorrateo de su período de cobertura. Las demás partidas conservan sus fechas propias, indicadas en el detalle."}
      </p>
      <p>
        <strong>IVA:</strong> facturas, notas de crédito y proveedores usan el subtotal sin IVA.
        {isCash && " En efectivo se prorratea; si la factura de proveedor no tiene total positivo, se usa el pago sin separar IVA."}
        {" "}Mantenimiento, daños y gastos operativos usan el importe registrado, sin separar IVA.
      </p>
      {isCash && <p>(Depreciación excluida en base efectivo)</p>}
      <details className="space-y-2">
        <summary className="cursor-pointer rounded-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Ver criterios por partida
        </summary>
        <ul className="list-disc space-y-1 pl-5">
          {isCash && (
            <li>
              Facturas y proveedores: se reconoce la parte proporcional del subtotal según cada cobro o pago.
              Si el total de la factura de proveedor no es positivo, se toma el importe del pago, sin separar IVA.
            </li>
          )}
          <li>
            Notas de crédito: por fecha de emisión, también en efectivo.
            {isCash && " En efectivo se ponderan por la proporción acumulada cobrada de su factura, hasta el 100%, incluidos cobros fuera del período consultado; no por la fecha de devolución de dinero."}
          </li>
          <li>Gastos operativos: por fecha del gasto, en ambas bases.</li>
          <li>Mantenimiento completado: por fecha de realización, en ambas bases.</li>
          <li>Daños: por fecha de reparación o, si falta, de creación, en ambas bases; se usa el costo real o, si falta, el estimado.</li>
          <li>
            Costo de equipos vendidos: el automático sigue la fecha de la factura de venta en devengado o del cobro en efectivo;
            el registrado mediante factura de proveedor sigue los criterios de proveedores.
          </li>
          {!isCash && <li>Depreciación: cálculo mensual desde la adquisición del equipo o, si falta esa fecha, desde su creación.</li>}
          <li>El costo automático de equipos vendidos y la depreciación parten del costo de adquisición registrado, sin separar IVA.</li>
          <li>Los documentos en divisa se convierten a MXN con los tipos de cambio registrados; los que no tienen el tipo requerido se excluyen.</li>
        </ul>
      </details>
    </section>
  );
}
