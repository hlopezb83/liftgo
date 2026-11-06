import { createRoot } from "react-dom/client";
import { HistoricalReconciliationCard } from "../../src/features/deliveries/components/deliveries/HistoricalReconciliationCard";
import { DeliveryMobileCard } from "../../src/features/deliveries/components/deliveries/DeliveryMobileCard";
import { reconciliation } from "../../src/features/deliveries/lib/__tests__/historicalReconciliation.fixture";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-4xl p-4 sm:p-8 space-y-4">
    <h1 className="text-xl font-semibold">Historial de entregas</h1>
    <DeliveryMobileCard d={{ id: "synthetic", delivery_number: "ENT-QA", status: "scheduled", type: "delivery", forklift_id: "qa", scheduled_date: "2026-01-10", scheduled_time: null, driver_name: null, address: null, historical_reconciliation: reconciliation }} forkliftMap={new Map()} />
    <HistoricalReconciliationCard reconciliation={reconciliation} />
    <HistoricalReconciliationCard reconciliation={{ ...reconciliation, classification: "equipment_sale", date_basis: "sale_invoice_issued_authorized", evidence: { description: "Venta y fecha confirmadas por el usuario con referencia a la factura de venta" } }} />
  </main>,
);
