import { parseISO } from "date-fns";
import { Controller } from "react-hook-form";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toYMD } from "@/lib/format/dateFormats";
import { useContractFormLogic } from "../hooks/useContractFormLogic";

export default function ContractForm() {
  const { isEdit, form, customers, forklifts, isPending, handleSubmit, navigate } = useContractFormLogic();
  const { control, register } = form;

  return (
    <PageContainer maxWidth="form">
      <FormPageHeader title={isEdit ? "Editar Contrato" : "Nuevo Contrato"} onBack={() => navigate("/contracts")} />

      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <Card>
            <CardHeader><CardTitle className="text-base">Información General</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={control} name="customer_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(customers || []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={control} name="forklift_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipo *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar equipo" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(forklifts || []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Controller control={control} name="start_date" render={({ field }) => (
                  <DatePickerField
                    label="Fecha de Inicio"
                    date={field.value ? parseISO(field.value) : undefined}
                    onSelect={(d) => field.onChange(d ? toYMD(d) : "")}
                    placeholder="Seleccionar fecha"
                  />
                )} />
                <FormField control={control} name="end_date" render={({ field }) => (
                  <FormItem>
                    <DatePickerField
                      label="Fecha de Fin"
                      date={field.value ? parseISO(field.value) : undefined}
                      onSelect={(d) => field.onChange(d ? toYMD(d) : "")}
                      placeholder="Seleccionar fecha"
                    />
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Tarifas y Depósito</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <FormField control={control} name="daily_rate" render={({ field }) => (
                  <FormItem><FormLabel>Diaria</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="weekly_rate" render={({ field }) => (
                  <FormItem><FormLabel>Semanal</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="monthly_rate" render={({ field }) => (
                  <FormItem><FormLabel>Mensual</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="deposit_amount" render={({ field }) => (
                  <FormItem><FormLabel>Depósito</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Condiciones de Uso</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Ubicación de Uso del Equipo</Label>
                  <Input {...register("usage_location")} placeholder="Dirección donde operará el montacargas" />
                </div>
                <FormField control={control} name="max_hours_per_month" render={({ field }) => (
                  <FormItem><FormLabel>Horas Máximas por Mes</FormLabel><FormControl><Input type="number" placeholder="Ej. 200" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="extra_hour_rate" render={({ field }) => (
                  <FormItem><FormLabel>Tarifa por Hora Extra ($)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="Ej. 150.00" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={control} name="payment_frequency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frecuencia de Pago</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="Semanal">Semanal</SelectItem>
                        <SelectItem value="Mensual">Mensual</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={control} name="late_interest_rate" render={({ field }) => (
                  <FormItem><FormLabel>Interés Moratorio (%)</FormLabel><FormControl><Input type="number" step="0.1" placeholder="Ej. 5" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div>
                  <Label>Ciudad del Contrato</Label>
                  <Input {...register("contract_city")} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Términos y Firmas</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Términos y Condiciones</Label>
                <Textarea rows={10} {...register("terms_text")} placeholder="Se cargará automáticamente al seleccionar cliente y equipo..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Firmado por</Label>
                  <Input {...register("signed_by")} placeholder="Nombre del firmante" />
                </div>
                <div>
                  <Label>Testigo 1</Label>
                  <Input {...register("witness_1")} placeholder="Nombre del testigo" />
                </div>
                <div>
                  <Label>Testigo 2</Label>
                  <Input {...register("witness_2")} placeholder="Nombre del testigo" />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea rows={2} {...register("notes")} />
              </div>
            </CardContent>
          </Card>

          <FormActions submitLabel={isEdit ? "Guardar Cambios" : "Crear Contrato"} isPending={isPending} onCancel={() => navigate("/contracts")} />
        </form>
      </Form>
    </PageContainer>
  );
}
