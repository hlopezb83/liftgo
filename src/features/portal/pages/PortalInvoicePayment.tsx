import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePortalInvoice,
  usePortalInvoicePayments,
  usePortalCustomer,
} from "@/features/customers";
import { useParams } from "@/lib/router-compat";
import { usePortalPaymentIntents } from "../hooks/usePortalExtras";
import { InvoiceNotFound, PaymentBody, PaymentQueryError } from "./PortalInvoicePaymentParts";

export default function PortalInvoicePayment() {
  const { id } = useParams();
  // A3-01: capturar error/refetch de las 3 queries — sin esto un fallo de red
  // mostraba "Factura no encontrada" o un saldo falso en la pantalla de cobro
  // (riesgo de pago duplicado).
  const inv = usePortalInvoice(id);
  const pay = usePortalInvoicePayments(id);
  const customerQuery = usePortalCustomer();
  const int = usePortalPaymentIntents(id);
  const [dlgOpen, setDlgOpen] = useState(false);

  const customer = customerQuery.data;
  const intents = int.data;
  const invoice = inv.data;
  const invoicePayments = pay.data ?? [];

  const isLoading = inv.isLoading || pay.isLoading || customerQuery.isLoading || int.isLoading;
  const hasError = inv.isError || pay.isError || customerQuery.isError || int.isError;
  const retryAll = () => {
    void inv.refetch();
    void pay.refetch();
    void customerQuery.refetch();
    void int.refetch();
  };

  if (isLoading) return <Skeleton className="h-96" />;
  if (hasError) return <PaymentQueryError onRetry={retryAll} />;
  if (!invoice) return <InvoiceNotFound />;

  return (
    <PaymentBody
      invoice={invoice}
      invoicePayments={invoicePayments}
      intents={intents ?? []}
      customer={customer}
      dlgOpen={dlgOpen}
      setDlgOpen={setDlgOpen}
    />
  );
}
