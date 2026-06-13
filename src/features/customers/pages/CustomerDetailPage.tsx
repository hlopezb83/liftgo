import { useParams } from "react-router-dom";
import { notifyError } from "@/lib/ui/appFeedback";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotesCard } from "@/components/domain/NotesCard";
import { UserPlus, Pencil, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { CustomerContactCard } from "../components/customer-detail/CustomerContactCard";
import { CustomerFinancialSummary } from "../components/customer-detail/CustomerFinancialSummary";
import { CustomerProfitabilityCard } from "../components/customer-detail/CustomerProfitabilityCard";
import { CustomerBookingsHistory } from "../components/customer-detail/CustomerBookingsHistory";
import { CustomerInvoicesList } from "../components/customer-detail/CustomerInvoicesList";
import { CustomerDeleteDialog } from "../components/customer-detail/CustomerDeleteDialog";
import { CustomerInviteDialog } from "../components/customer-detail/CustomerInviteDialog";
import { CustomerFormDialog } from "../components/customers/CustomerFormDialog";
import { useCustomerDetailPage } from "../hooks/customers/useCustomerDetailPage";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const s = useCustomerDetailPage(id);

  const handleExportStatement = async () => {
    if (!s.summary || !s.customer) return;
    try {
      const { exportCustomerStatementPdf } = await import("@/lib/pdf/customerStatement");
      await exportCustomerStatementPdf({ customer: s.customer, summary: s.summary });
      toast.success("Estado de cuenta generado");
    } catch {
      notifyError({ message: "No se pudo generar el PDF" });
    }
  };

  if (s.isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!s.customer) return <div className="p-6 text-muted-foreground">Cliente no encontrado</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <DetailPageHeader
        title={s.customer.name}
        subtitle={s.customer.company || undefined}
        backTo="/customers"
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!s.summary} onClick={handleExportStatement}>
              <FileDown className="h-4 w-4 mr-2" /> Estado de Cuenta
            </Button>
            <Button variant="outline" size="sm" onClick={() => s.setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
            {s.role === "admin" && (
              <Button variant="destructive" size="sm" onClick={() => s.setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar
              </Button>
            )}
            {s.role === "admin" && !s.hasPortalAccess && (
              <Button variant="outline" onClick={() => { s.setInviteEmail(s.customer?.email || ""); s.setInviteOpen(true); }}>
                <UserPlus className="h-4 w-4 mr-2" /> Invitar al Portal
              </Button>
            )}
            {s.hasPortalAccess && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Acceso al portal activo</span>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CustomerContactCard customer={s.customer} />
        <CustomerFinancialSummary totalInvoiced={s.totalInvoiced} totalPaid={s.totalPaid} outstanding={s.outstanding} />
        {s.profitability && (
          <CustomerProfitabilityCard
            revenue={s.profitability.revenue}
            maintenance_cost={s.profitability.maintenance_cost}
            gross_margin={s.profitability.gross_margin}
            margin_percent={s.profitability.margin_percent}
          />
        )}
      </div>

      <CustomerBookingsHistory bookings={s.bookings} />
      <CustomerInvoicesList invoices={s.invoices} />

      {s.customer.notes && <NotesCard value={s.customer.notes} readOnly />}

      <CustomerFormDialog
        open={s.editOpen}
        onOpenChange={s.setEditOpen}
        initialData={s.editInitialData}
        isEdit
        isPending={s.updateCustomer.isPending}
        onSubmit={s.handleEditSubmit}
      />

      <CustomerDeleteDialog
        open={s.deleteOpen}
        onOpenChange={s.setDeleteOpen}
        customerName={s.customer.name}
        bookingsCount={s.bookings.length}
        invoicesCount={s.invoices.length}
        outstanding={s.outstanding}
        isPending={s.deleteCustomer.isPending}
        onDelete={s.handleDelete}
      />

      <CustomerInviteDialog
        open={s.inviteOpen}
        onOpenChange={s.setInviteOpen}
        customerName={s.customer.name}
        email={s.inviteEmail}
        setEmail={s.setInviteEmail}
        isPending={s.inviteCustomer.isPending}
        onInvite={s.handleInvite}
      />
    </div>
  );
}
