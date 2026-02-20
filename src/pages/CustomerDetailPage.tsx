import { useParams, useNavigate } from "react-router-dom";
import { useCustomers, useBookings, useInvoices } from "@/hooks/useForkliftData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Mail, Phone, Globe, MapPin, Receipt, CalendarDays, UserPlus } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useUserRole } from "@/hooks/useUserRole";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers, isLoading } = useCustomers();
  const { data: allBookings } = useBookings();
  const { data: allInvoices } = useInvoices();
  const { data: role } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const customer = customers?.find((c) => c.id === id);
  const bookings = allBookings?.filter((b) => b.customer_id === id);
  const invoices = allInvoices?.filter((i) => i.customer_id === id);

  const totalInvoiced = invoices?.reduce((sum, i) => sum + Number(i.total), 0) || 0;
  const totalPaid = invoices?.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total), 0) || 0;
  const outstanding = totalInvoiced - totalPaid;

  const hasPortalAccess = !!(customer as any)?.user_id;

  const handleInvite = async () => {
    if (!inviteEmail || !id) return;
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("invite-customer", {
        body: { customer_id: id, email: inviteEmail },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Invitación enviada", description: `Acceso al portal creado para ${inviteEmail}` });
      setInviteOpen(false);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!customer) return <div className="p-6 text-muted-foreground">Cliente no encontrado</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{customer.name}</h1>
            {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
          </div>
        </div>
        {role === "admin" && !hasPortalAccess && (
          <Button variant="outline" onClick={() => { setInviteEmail(customer.email || ""); setInviteOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-2" /> Invitar al Portal
          </Button>
        )}
        {hasPortalAccess && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Acceso al portal activo</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Información de Contacto</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {customer.contact_person && (
              <div><p className="text-xs text-muted-foreground">Persona de Contacto</p><p className="font-medium">{customer.contact_person}</p></div>
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
              <div><p className="text-xs text-muted-foreground">RFC</p><p className="font-medium">{customer.tax_id}</p></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Resumen Financiero</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Facturado</span>
              <span className="font-mono font-semibold">{formatCurrency(totalInvoiced)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Pagado</span>
              <span className="font-mono font-semibold text-status-available">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="font-medium">Saldo Pendiente</span>
              <span className={`font-mono font-bold ${outstanding > 0 ? "text-destructive" : ""}`}>{formatCurrency(outstanding)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Historial de Reservas</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <div className="space-y-2">
              {bookings.map((b) => (
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
            <p className="text-sm text-muted-foreground text-center py-6">Sin reservas aún</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Facturas</CardTitle>
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
                    <p className="text-xs text-muted-foreground">{inv.issued_at}{inv.due_date ? ` — Vence: ${inv.due_date}` : ""}</p>
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
        <Card>
          <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{customer.notes}</p></CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar al Portal de Clientes</DialogTitle>
            <DialogDescription>
              Crear una cuenta de portal para {customer.name}. Recibirán un correo para establecer su contraseña.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="invite-email">Correo Electrónico</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
              />
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
