import { useEffect } from "react";
import { useBookings } from "@/hooks/useBookings";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDefaultContractTemplate } from "@/features/contracts/hooks/useContractTemplates";
import { replacePlaceholders } from "@/lib/templateUtils";
import type { ContractFormShape } from "./contractFormDefaults";
import type { Database } from "@/integrations/supabase/types";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Forklift = Database["public"]["Tables"]["forklifts"]["Row"];

interface Args {
  isEdit: boolean;
  bookingId: string | null;
  form: ContractFormShape;
  setForm: React.Dispatch<React.SetStateAction<ContractFormShape>>;
  customers?: Customer[];
  forklifts?: Forklift[];
  templateApplied: boolean;
  setTemplateApplied: (v: boolean) => void;
}

export function useContractFormPrefill({
  isEdit, bookingId, form, setForm, customers, forklifts, templateApplied, setTemplateApplied,
}: Args) {
  const { data: bookings } = useBookings();
  const { data: company } = useCompanySettings();
  const { data: template } = useDefaultContractTemplate();

  // Pre-fill from booking
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
  }, [bookingId, bookings, forklifts, isEdit, setForm]);

  // Auto-fill rates from forklift
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
  }, [form.forklift_id, forklifts, isEdit, bookingId, setForm]);

  // Auto-fill template
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
    }, "bracket");

    setForm((prev) => ({ ...prev, terms_text: text }));
    setTemplateApplied(true);
  }, [
    isEdit, templateApplied, template, form.customer_id, form.forklift_id,
    form.usage_location, form.max_hours_per_month, form.extra_hour_rate,
    form.start_date, form.end_date, form.monthly_rate, form.weekly_rate,
    form.daily_rate, form.payment_frequency, form.late_interest_rate,
    customers, forklifts, company, setForm, setTemplateApplied,
  ]);
}
