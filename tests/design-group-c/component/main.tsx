import { useState } from "react";
import { createRoot } from "react-dom/client";
import { RegisterSupplierPaymentDialog as Before } from "../before/RegisterSupplierPaymentDialog";
import { RegisterSupplierPaymentDialog as After } from "../../../src/features/accounts-payable/components/RegisterSupplierPaymentDialog";
import { CustomerInvoicesList as BeforeInvoices } from "../before/CustomerInvoicesList";
import { CustomerInvoicesList as AfterInvoices } from "../../../src/features/customers/components/customer-detail/CustomerInvoicesList";
import { CustomerBookingsHistory as BeforeBookings } from "../before/CustomerBookingsHistory";
import { CustomerBookingsHistory as AfterBookings } from "../../../src/features/customers/components/customer-detail/CustomerBookingsHistory";
import { CustomerContactCard as BeforeContact } from "../before/CustomerContactCard";
import { CustomerContactCard as AfterContact } from "../../../src/features/customers/components/customer-detail/CustomerContactCard";
import "../../../src/styles.css";

function Fixture() {
  const [open, setOpen] = useState(true);
  const params = new URLSearchParams(location.search);
  const Payment = params.get("state") === "before" ? Before : After;
  const currency = params.get("currency") === "MXN" ? "MXN" : "USD";
  if (params.get("view") === "customer-detail") {
    const before = params.get("state") === "before", Invoices = before ? BeforeInvoices : AfterInvoices, Bookings = before ? BeforeBookings : AfterBookings, Contact = before ? BeforeContact : AfterContact;
    const customer = { name: "QA Cliente Industrial de Maniobras y Servicios del Norte de México", company: "QA Cliente Industrial", email: "contacto.operaciones.industriales.qa@example.invalid", phone: "0000000000", contact_person: "QA Contacto Industrial con nombre completo y apellidos muy largos", address: "Calle Ficticia Industrial 123, Parque de Maniobras QA, Monterrey, Nuevo León", rfc: "XAXX010101000", representante_legal: "QA Representante Legal Ficticio", website: "https://example.invalid/servicios/montacargas" };
    const bookings = ["active", "confirmed"].map((status, n) => ({ id: `qa-booking-${n}`, status, start_date: "2026-10-01", end_date: "2026-11-30", forklift: { name: "QA Equipo ficticio industrial con nombre largo para maniobras del norte", model: "Modelo Industrial Eléctrico de Capacidad Extendida 2500" } }));
    const invoices = ["USD", "MXN"].map((currency, n) => ({ id: `qa-invoice-${n}`, invoice_number: `FAC-2026-OPERACION-INDUSTRIAL-0000001234${n}`, total: n ? 987654321.09 : 1234567890.12, currency, status: n ? "overdue" : "sent", issued_at: "2026-10-01", due_date: "2026-11-15" }));
    return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6"><h1 className="text-xl font-bold">Fixture ficticio local · cliente</h1><Contact customer={customer as Parameters<typeof Contact>[0]["customer"]}/><Bookings bookings={bookings}/><Invoices invoices={invoices}/></main>;
  }
  return <main className="p-6"><h1>Fixture ficticio local · pago {currency}</h1><button onClick={() => setOpen(true)}>Abrir pago ficticio</button><Payment open={open} onOpenChange={setOpen} billId="fixture-bill" billNumber="QA-FACTURA-PROVEEDOR-INDUSTRIAL-1234567890" balance={1234567890.12} currency={currency}/></main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
