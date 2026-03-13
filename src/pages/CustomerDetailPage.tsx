import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCustomers, useUpdateCustomer, useDeleteCustomer } from "@/hooks/useCustomers";
import { useBookings } from "@/hooks/useBookings";
import { useInvoices } from "@/hooks/useInvoices";
import { DetailPageHeader } from "@/components/DetailPageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotesCard } from "@/components/NotesCard";
import { StatusBadge } from "@/components/StatusBadge";
import { UserPlus, CalendarDays, Receipt, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatDateDisplay } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useUserRole } from "@/hooks/useUserRole";
import { CustomerContactCard } from "@/components/customer-detail/CustomerContactCard";
import { CustomerFinancialSummary } from "@/components/customer-detail/CustomerFinancialSummary";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import type { CustomerFormData } from "@/lib/formSchemas";
import { toast as sonnerToast } from "sonner";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers, isLoading } = useCustomers();
  const { data: allBookings } = useBookings();
  const { data: allInvoices } = useInvoices();
  const { data: role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const customer = customers?.find((c) => c.id === id);
  const bookings = allBookings?.filter((b) => b.customer_id === id);
  const invoices = allInvoices?.filter((i) => i.customer_id === id);

  const totalInvoiced = invoices?.reduce((sum, i) => sum + Number(i.total), 0) || 0;
  const totalPaid = invoices?.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total), 0) || 0;
  const outstanding = totalInvoiced - totalPaid;

  const hasPortalAccess = !!customer?.user_id;

  const handleInvite = async () => {
    if (!inviteEmail || !id) return;
    setInviting(true);
    try {
      const res = await supabase.functions.invoke("invite-customer", { body: { customer_id: id, email: inviteEmail } });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Invitación enviada", description: `Acceso al portal creado para ${inviteEmail}` });
      setInviteOpen(false);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error desconocido", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleEditSubmit = (form: CustomerFormData) => {
    if (!id) return;
    const payload = {
      id,
      name: form.name, company: form.name, email: form.email || null, phone: form.phone || null,
      address: form.address || null, notes: form.notes || null,
      website: form.website || null,
      contact_person: form.contact_person || null,
      rfc: form.rfc || null, regimen_fiscal: form.regimen_fiscal || null,
      uso_cfdi: form.uso_cfdi || null, domicilio_fiscal_cp: form.domicilio_fiscal_cp || null,
      representante_legal: form.representante_legal || null,
    };
    updateCustomer.mutate(payload, {
      onSuccess: () => { sonnerToast.success("Cliente actualizado"); setEditOpen(false); },
    });
  };

  const editInitialData = customer ? {
    name: customer.name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    address: customer.address || "",
    notes: customer.notes || "",
    website: customer.website || "",
    contact_person: customer.contact_person || "",
    
    rfc: customer.rfc || "",
    regimen_fiscal: customer.regimen_fiscal || "",
    uso_cfdi: customer.uso_cfdi || "",
    domicilio_fiscal_cp: customer.domicilio_fiscal_cp || "",
    representante_legal: customer.representante_legal || "",
  } : undefined;

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!customer) return <div className="p-6 text-muted-foreground">Cliente no encontrado</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <DetailPageHeader
        title={customer.name}
        subtitle={customer.company || undefined}
        backTo="/customers"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
            {role === "admin" && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar
              </Button>
            )}
            {role === "admin" && !hasPortalAccess && (
              <Button variant="outline" onClick={() => { setInviteEmail(customer.email || ""); setInviteOpen(true); }}>
                <UserPlus className="h-4 w-4 mr-2" /> Invitar al Portal
              </Button>
            )}
            {hasPortalAccess && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Acceso al portal activo</span>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CustomerContactCard customer={customer} />
        <CustomerFinancialSummary totalInvoiced={totalInvoiced} totalPaid={totalPaid} outstanding={outstanding} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Historial de Reservas</CardTitle></CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
                  <div>
                    <p className="font-medium">{b.forklifts?.name || "—"} — {b.forklifts?.model || ""}</p>
                    <p className="text-xs text-muted-foreground">{formatDateDisplay(b.start_date)} → {formatDateDisplay(b.end_date)}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Sin reservas aún</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Facturas</CardTitle></CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm cursor-pointer hover:bg-muted/60" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <div>
                    <p className="font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">{formatDateDisplay(inv.issued_at)}{inv.due_date ? ` — Vence: ${formatDateDisplay(inv.due_date)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold">{formatCurrency(Number(inv.total))}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Sin facturas aún</p>
          )}
        </CardContent>
      </Card>

      {customer.notes && (
        <NotesCard value={customer.notes} readOnly />
      )}

      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={editInitialData}
        isEdit
        isPending={updateCustomer.isPending}
        onSubmit={handleEditSubmit}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {(bookings && bookings.length > 0) || (invoices && invoices.length > 0)
                ? "Este cliente tiene reservas o facturas asociadas y no puede ser eliminado. Elimina primero las dependencias."
                : "Esta acción no se puede deshacer. Se eliminará permanentemente el cliente del sistema."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {!((bookings && bookings.length > 0) || (invoices && invoices.length > 0)) && (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!id) return;
                  deleteCustomer.mutate(id, {
                    onSuccess: () => {
                      sonnerToast.success("Cliente eliminado");
                      navigate("/customers");
                    },
                  });
                }}
              >
                {deleteCustomer.isPending ? "Eliminando..." : "Eliminar"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar al Portal de Clientes</DialogTitle>
            <DialogDescription>Crear una cuenta de portal para {customer.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="invite-email">Correo Electrónico</Label>
              <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="cliente@ejemplo.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail}>
              {inviting ? "Enviando..." : "Enviar Invitación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
