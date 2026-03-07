import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useContract, useCreateContract, useUpdateContract } from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import { useForklifts } from "@/hooks/useForklifts";
import { useBookings } from "@/hooks/useBookings";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDefaultContractTemplate } from "@/hooks/useContractTemplates";
import { FormPageHeader } from "@/components/FormPageHeader";
import { FormActions } from "@/components/FormActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DatePickerField } from "@/components/DatePickerField";
import { format, parseISO } from "date-fns";

const defaultForm = {
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
  usage_location: "",
  max_hours_per_month: "",
  extra_hour_rate: "",
  payment_frequency: "Mensual",
  late_interest_rate: "5",
  contract_city: "San Pedro Garza García, N.L.",
  witness_1: "",
  witness_2: "",
};

function replacePlaceholders(
  template: string,
  params: Record<string, string>
): string {
  let text = template;
  for (const [key, value] of Object.entries(params)) {
    text = text.split(`[${key}]`).join(value || "—");
  }
  return text;
}

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
  const { data: company } = useCompanySettings();
  const { data: template } = useDefaultContractTemplate();
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();

  const [form, setForm] = useState(defaultForm);
  const [templateApplied, setTemplateApplied] = useState(false);

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
        usage_location: existing.usage_location || "",
        max_hours_per_month: String(existing.max_hours_per_month || ""),
        extra_hour_rate: String(existing.extra_hour_rate || ""),
        payment_frequency: existing.payment_frequency || "Mensual",
        late_interest_rate: String(existing.late_interest_rate || 5),
        contract_city: existing.contract_city || "San Pedro Garza García, N.L.",
        witness_1: existing.witness_1 || "",
        witness_2: existing.witness_2 || "",
      });
      setTemplateApplied(true);
    }
  }, [existing, isEdit]);

  // Pre-fill from booking query param
  useEffect(() => {
    if (!isEdit && bookingId && bookings && forklifts) {
      const booking = bookings.find((b) => b.id === bookingId);
      if (booking) {
        const forklift = forklifts.find((f) => f.id === booking.forklift_id);
        setForm((prev) => ({
          ...prev,
          customer_id: booking.customer_id || prev.customer_id,
          forklift_id: booking.forklift_id,
          start_date: booking.start_date || prev.start_date,
          end_date: booking.end_date || prev.end_date,
          daily_rate: String(forklift?.daily_rate || 0),
          weekly_rate: String(forklift?.weekly_rate || 0),
          monthly_rate: String(forklift?.monthly_rate || 0),
        }));
      }
    }
  }, [bookingId, bookings, forklifts, isEdit]);

  useEffect(() => {
    if (!isEdit && !bookingId && form.forklift_id && forklifts) {
      const forklift = forklifts.find((f) => f.id === form.forklift_id);
      if (forklift) {
        setForm((prev) => ({
          ...prev,
          daily_rate: String(forklift.daily_rate || 0),
          weekly_rate: String(forklift.weekly_rate || 0),
          monthly_rate: String(forklift.monthly_rate || 0),
        }));
      }
    }
  }, [form.forklift_id, forklifts, isEdit, bookingId]);

  // Auto-fill template when creating new contract and all data is ready
  useEffect(() => {
    if (isEdit || templateApplied || !template?.body_text) return;
    if (!form.customer_id || !form.forklift_id) return;

    const customer = customers?.find((c) => c.id === form.customer_id);
    const forklift = forklifts?.find((f) => f.id === form.forklift_id);
    if (!customer || !forklift) return;

    const text = replacePlaceholders(template.body_text, {
      EMPRESA_ARRENDADOR: company?.razon_social || "[Nombre de tu empresa]",
      NOMBRE_CLIENTE: customer.name,
      DOMICILIO_CLIENTE: customer.address || "[Domicilio del cliente]",
      MARCA_EQUIPO: forklift.manufacturer || "—",
      MODELO_EQUIPO: forklift.model || "—",
      SERIE_EQUIPO: forklift.serial_number || "—",
      CAPACIDAD_EQUIPO: forklift.capacity_kg ? `${forklift.capacity_kg} kg` : "—",
      COMBUSTIBLE_EQUIPO: forklift.fuel_type || "—",
      UBICACION_USO: form.usage_location || "[Dirección]",
      HORAS_MAX: form.max_hours_per_month || "[Número]",
      TARIFA_HORA_EXTRA: form.extra_hour_rate || "[Monto]",
      FECHA_INICIO: form.start_date || "[Fecha de inicio]",
      FECHA_FIN: form.end_date || "[Fecha de término]",
      MONTO_RENTA: form.monthly_rate || form.weekly_rate || form.daily_rate || "[Monto]",
      FRECUENCIA_PAGO: form.payment_frequency || "Mensual",
      INTERES_MORATORIO: form.late_interest_rate || "5",
      REPRESENTANTE_LEGAL: customer.representante_legal || "",
    });

    setForm((prev) => ({ ...prev, terms_text: text }));
    setTemplateApplied(true);
  }, [isEdit, templateApplied, template, form.customer_id, form.forklift_id, customers, forklifts, company]);

  const isPending = createContract.isPending || updateContract.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      usage_location: form.usage_location || null,
      max_hours_per_month: form.max_hours_per_month ? Number(form.max_hours_per_month) : null,
      extra_hour_rate: form.extra_hour_rate ? Number(form.extra_hour_rate) : null,
      payment_frequency: form.payment_frequency || "Mensual",
      late_interest_rate: form.late_interest_rate ? Number(form.late_interest_rate) : 5,
      contract_city: form.contract_city || "San Pedro Garza García, N.L.",
      witness_1: form.witness_1 || null,
      witness_2: form.witness_2 || null,
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

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <FormPageHeader title={isEdit ? "Editar Contrato" : "Nuevo Contrato"} onBack={() => navigate("/contracts")} />

      <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Información General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.customer_id} onValueChange={(v) => updateField("customer_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                <SelectContent>
                  {(customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Equipo *</Label>
              <Select value={form.forklift_id} onValueChange={(v) => updateField("forklift_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar equipo" /></SelectTrigger>
                <SelectContent>
                  {(forklifts || []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DatePickerField
              label="Fecha de Inicio"
              date={form.start_date ? parseISO(form.start_date) : undefined}
              onSelect={(d) => updateField("start_date", d ? format(d, "yyyy-MM-dd") : "")}
              placeholder="Seleccionar fecha"
            />
            <DatePickerField
              label="Fecha de Fin"
              date={form.end_date ? parseISO(form.end_date) : undefined}
              onSelect={(d) => updateField("end_date", d ? format(d, "yyyy-MM-dd") : "")}
              placeholder="Seleccionar fecha"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tarifas y Depósito</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><Label>Diaria</Label><Input type="number" step="0.01" value={form.daily_rate} onChange={(e) => updateField("daily_rate", e.target.value)} /></div>
            <div><Label>Semanal</Label><Input type="number" step="0.01" value={form.weekly_rate} onChange={(e) => updateField("weekly_rate", e.target.value)} /></div>
            <div><Label>Mensual</Label><Input type="number" step="0.01" value={form.monthly_rate} onChange={(e) => updateField("monthly_rate", e.target.value)} /></div>
            <div><Label>Depósito</Label><Input type="number" step="0.01" value={form.deposit_amount} onChange={(e) => updateField("deposit_amount", e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Condiciones de Uso</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Ubicación de Uso del Equipo</Label>
              <Input value={form.usage_location} onChange={(e) => updateField("usage_location", e.target.value)} placeholder="Dirección donde operará el montacargas" />
            </div>
            <div>
              <Label>Horas Máximas por Mes</Label>
              <Input type="number" value={form.max_hours_per_month} onChange={(e) => updateField("max_hours_per_month", e.target.value)} placeholder="Ej. 200" />
            </div>
            <div>
              <Label>Tarifa por Hora Extra ($)</Label>
              <Input type="number" step="0.01" value={form.extra_hour_rate} onChange={(e) => updateField("extra_hour_rate", e.target.value)} placeholder="Ej. 150.00" />
            </div>
            <div>
              <Label>Frecuencia de Pago</Label>
              <Select value={form.payment_frequency} onValueChange={(v) => updateField("payment_frequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Semanal">Semanal</SelectItem>
                  <SelectItem value="Mensual">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Interés Moratorio (%)</Label>
              <Input type="number" step="0.1" value={form.late_interest_rate} onChange={(e) => updateField("late_interest_rate", e.target.value)} placeholder="Ej. 5" />
            </div>
            <div>
              <Label>Ciudad del Contrato</Label>
              <Input value={form.contract_city} onChange={(e) => updateField("contract_city", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Términos y Firmas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Términos y Condiciones</Label>
            <Textarea rows={10} value={form.terms_text} onChange={(e) => updateField("terms_text", e.target.value)} placeholder="Se cargará automáticamente al seleccionar cliente y equipo..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Firmado por</Label>
              <Input value={form.signed_by} onChange={(e) => updateField("signed_by", e.target.value)} placeholder="Nombre del firmante" />
            </div>
            <div>
              <Label>Testigo 1</Label>
              <Input value={form.witness_1} onChange={(e) => updateField("witness_1", e.target.value)} placeholder="Nombre del testigo" />
            </div>
            <div>
              <Label>Testigo 2</Label>
              <Input value={form.witness_2} onChange={(e) => updateField("witness_2", e.target.value)} placeholder="Nombre del testigo" />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => updateField("notes", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <FormActions submitLabel={isEdit ? "Guardar Cambios" : "Crear Contrato"} isPending={isPending} onCancel={() => navigate("/contracts")} />
      </form>
    </div>
  );
}
