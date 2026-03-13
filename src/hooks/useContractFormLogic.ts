import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useContract, useCreateContract, useUpdateContract } from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import { useForklifts } from "@/hooks/useForklifts";
import { useBookings } from "@/hooks/useBookings";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDefaultContractTemplate } from "@/hooks/useContractTemplates";
import { replacePlaceholders } from "@/lib/templateUtils";
import { toast } from "sonner";
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

export function useContractFormLogic() {
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

  // Load existing contract
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
  }, [bookingId, bookings, forklifts, isEdit]);

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
  }, [form.forklift_id, forklifts, isEdit, bookingId]);

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

  return {
    id,
    isEdit,
    form,
    customers,
    forklifts,
    isPending,
    handleSubmit,
    updateField,
    navigate,
    parseISO,
    format,
  };
}
