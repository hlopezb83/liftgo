import { useContractFormLogic } from "../hooks/useContractFormLogic";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { FormActions } from "@/components/forms/FormActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { parseISO, format } from "date-fns";

export default function ContractForm() {
  const {
    isEdit, form, customers, forklifts, isPending,
    handleSubmit, updateField, navigate,
  } = useContractFormLogic();

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
