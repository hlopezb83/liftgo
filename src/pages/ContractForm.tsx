import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useContract, useCreateContract, useUpdateContract } from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import { useForklifts } from "@/hooks/useForklifts";
import { useBookings } from "@/hooks/useBookings";
import { FormPageHeader } from "@/components/FormPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DatePickerField } from "@/components/DatePickerField";
import { format, parseISO } from "date-fns";

export default function ContractForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking_id");
  const { data: existing } = useContract(isEdit ? id : undefined);
  const { data: customers } = useCustomers();
  const { data: forklifts } = useForklifts();
  const { data: bookings } = useBookings();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();

  const [form, setForm] = useState({
    customer_id: "",
    forklift_id: "",
    start_date: "",
    end_date: "",
    daily_rate: "0",
    weekly_rate: "0",
    monthly_rate: "0",
    deposit_amount: "0",
    terms_text: "",
    signed_by: "",
    notes: "",
  });

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        customer_id: existing.customer_id || "",
        forklift_id: existing.forklift_id || "",
        start_date: existing.start_date || "",
        end_date: existing.end_date || "",
        daily_rate: String(existing.daily_rate || 0),
        weekly_rate: String(existing.weekly_rate || 0),
        monthly_rate: String(existing.monthly_rate || 0),
        deposit_amount: String(existing.deposit_amount || 0),
        terms_text: existing.terms_text || "",
        signed_by: existing.signed_by || "",
        notes: existing.notes || "",
      });
    }
  }, [existing, isEdit]);

  // Pre-fill from booking query param
  useEffect(() => {
    if (!isEdit && bookingId && bookings && forklifts) {
      const booking = bookings.find((b) => b.id === bookingId);
      if (booking) {
        const fl = forklifts.find((f) => f.id === booking.forklift_id);
        setForm((prev) => ({
          ...prev,
          customer_id: booking.customer_id || prev.customer_id,
          forklift_id: booking.forklift_id,
          start_date: booking.start_date || prev.start_date,
          end_date: booking.end_date || prev.end_date,
          daily_rate: String(fl?.daily_rate || 0),
          weekly_rate: String(fl?.weekly_rate || 0),
          monthly_rate: String(fl?.monthly_rate || 0),
        }));
      }
    }
  }, [bookingId, bookings, forklifts, isEdit]);

  useEffect(() => {
    if (!isEdit && !bookingId && form.forklift_id && forklifts) {
      const fl = forklifts.find((f) => f.id === form.forklift_id);
      if (fl) {
        setForm((prev) => ({
          ...prev,
          daily_rate: String(fl.daily_rate || 0),
          weekly_rate: String(fl.weekly_rate || 0),
          monthly_rate: String(fl.monthly_rate || 0),
        }));
      }
    }
  }, [form.forklift_id, forklifts, isEdit, bookingId]);

  const handleSubmit = () => {
    if (!form.customer_id || !form.forklift_id) {
      toast.error("Cliente y equipo son requeridos");
      return;
    }
    const payload = {
      customer_id: form.customer_id,
      forklift_id: form.forklift_id,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      daily_rate: Number(form.daily_rate),
      weekly_rate: Number(form.weekly_rate),
      monthly_rate: Number(form.monthly_rate),
      deposit_amount: Number(form.deposit_amount),
      terms_text: form.terms_text || null,
      signed_by: form.signed_by || null,
      notes: form.notes || null,
      booking_id: bookingId || null,
      status: "draft",
      signed_at: null,
    };

    if (isEdit) {
      updateContract.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Contrato actualizado"); navigate(`/contracts/${id}`); },
      });
    } else {
      createContract.mutate(payload, {
        onSuccess: (data: any) => { toast.success("Contrato creado"); navigate(`/contracts/${data.id}`); },
      });
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <FormPageHeader title={isEdit ? "Editar Contrato" : "Nuevo Contrato"} onBack={() => navigate("/contracts")} />

      <Card>
        <CardHeader><CardTitle className="text-base">Información General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                <SelectContent>
                  {(customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Equipo *</Label>
              <Select value={form.forklift_id} onValueChange={(v) => setForm({ ...form, forklift_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar equipo" /></SelectTrigger>
                <SelectContent>
                  {(forklifts || []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DatePickerField
              label="Fecha de Inicio"
              date={form.start_date ? parseISO(form.start_date) : undefined}
              onSelect={(d) => setForm({ ...form, start_date: d ? format(d, "yyyy-MM-dd") : "" })}
              placeholder="Seleccionar fecha"
            />
            <DatePickerField
              label="Fecha de Fin"
              date={form.end_date ? parseISO(form.end_date) : undefined}
              onSelect={(d) => setForm({ ...form, end_date: d ? format(d, "yyyy-MM-dd") : "" })}
              placeholder="Seleccionar fecha"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tarifas y Depósito</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><Label>Diaria</Label><Input type="number" step="0.01" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
            <div><Label>Semanal</Label><Input type="number" step="0.01" value={form.weekly_rate} onChange={(e) => setForm({ ...form, weekly_rate: e.target.value })} /></div>
            <div><Label>Mensual</Label><Input type="number" step="0.01" value={form.monthly_rate} onChange={(e) => setForm({ ...form, monthly_rate: e.target.value })} /></div>
            <div><Label>Depósito</Label><Input type="number" step="0.01" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Términos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Términos y Condiciones</Label>
            <Textarea rows={6} value={form.terms_text} onChange={(e) => setForm({ ...form, terms_text: e.target.value })} placeholder="Términos del contrato de renta..." />
          </div>
          <div>
            <Label>Firmado por</Label>
            <Input value={form.signed_by} onChange={(e) => setForm({ ...form, signed_by: e.target.value })} placeholder="Nombre del firmante" />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 pt-2">
        <Button onClick={handleSubmit} disabled={createContract.isPending || updateContract.isPending}>
          {isEdit ? "Guardar Cambios" : "Crear Contrato"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/contracts")}>Cancelar</Button>
      </div>
    </div>
  );
}
