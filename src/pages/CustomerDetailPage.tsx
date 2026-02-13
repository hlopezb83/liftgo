import { useParams, useNavigate } from "react-router-dom";
import { useCustomers, useBookings, useInvoices } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mail, Phone, Globe, MapPin, Receipt, CalendarDays } from "lucide-react";
import { format } from "date-fns";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers, isLoading } = useCustomers();
  const { data: allBookings } = useBookings();
  const { data: allInvoices } = useInvoices();

  const customer = customers?.find((c) => c.id === id);
  const bookings = allBookings?.filter((b: any) => b.customer_id === id);
  const invoices = allInvoices?.filter((i) => i.customer_id === id);

  const totalInvoiced = invoices?.reduce((sum, i) => sum + Number(i.total), 0) || 0;
  const totalPaid = invoices?.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total), 0) || 0;
  const outstanding = totalInvoiced - totalPaid;

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!customer) return <div className="p-6 text-muted-foreground">Customer not found</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
        </div>
      </div>

      {/* Contact info + financial summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {customer.contact_person && (
              <div><p className="text-xs text-muted-foreground">Contact Person</p><p className="font-medium">{customer.contact_person}</p></div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.email}</span></div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.phone}</span></div>
            )}
            {customer.website && (
              <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.website}</span></div>
            )}
            {customer.address && (
              <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /><span>{customer.address}</span></div>
            )}
            {customer.tax_id && (
              <div><p className="text-xs text-muted-foreground">Tax ID</p><p className="font-medium">{customer.tax_id}</p></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Financial Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Invoiced</span>
              <span className="font-mono font-semibold">€{totalInvoiced.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-mono font-semibold text-status-available">€{totalPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="font-medium">Outstanding</span>
              <span className={`font-mono font-bold ${outstanding > 0 ? "text-destructive" : ""}`}>€{outstanding.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Booking history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Booking History</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
                  <div>
                    <p className="font-medium">{b.forklifts?.name || "—"} — {b.forklifts?.model || ""}</p>
                    <p className="text-xs text-muted-foreground">{b.start_date} → {b.end_date}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No bookings yet</p>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm cursor-pointer hover:bg-muted/60"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                >
                  <div>
                    <p className="font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">{inv.issued_at}{inv.due_date ? ` — Due: ${inv.due_date}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold">€{Number(inv.total).toFixed(2)}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No invoices yet</p>
          )}
        </CardContent>
      </Card>

      {customer.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{customer.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
