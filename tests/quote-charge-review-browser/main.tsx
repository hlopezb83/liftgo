import { createRoot } from "react-dom/client";
import { QuoteChargeLegacyReview } from "../../src/features/invoices/components/quote-charge-review/QuoteChargeLegacyReview";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-4xl p-4 sm:p-8 space-y-4">
    <h1 className="text-xl font-semibold">Cotización sintética COT-QA</h1>
    <p>Fixture local sin conexión a servicios ni datos operativos.</p>
    <QuoteChargeLegacyReview quoteId="12300000-0000-4000-8000-000000000100" quoteNumber="COT-QA" />
  </main>,
);
