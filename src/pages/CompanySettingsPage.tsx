import { useEffect } from "react";
import { useCompanySettings, useUpsertCompanySettings } from "@/hooks/useCompanySettings";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormState } from "@/hooks/useFormState";
import { toast } from "sonner";
import { CompanyFiscalForm } from "@/components/company-settings/CompanyFiscalForm";
import { PacConfigForm } from "@/components/company-settings/PacConfigForm";

const empty = {
  rfc: "", razon_social: "", regimen_fiscal: "", lugar_expedicion: "",
  logo_url: "", facturapi_mode: "test", facturapi_test_key: "", facturapi_live_key: "",
};

export default function CompanySettingsPage() {
  const { data: settings, isLoading } = useCompanySettings();
  const upsert = useUpsertCompanySettings();
  const { form, set, setForm } = useFormState(empty);

  useEffect(() => {
    if (!settings) return;
    const s = settings as Record<string, unknown>;
    setForm({
      rfc: settings.rfc || "",
      razon_social: settings.razon_social || "",
      regimen_fiscal: settings.regimen_fiscal || "",
      lugar_expedicion: settings.lugar_expedicion || "",
      logo_url: settings.logo_url || "",
      facturapi_mode: (s.facturapi_mode as string) || "test",
      facturapi_test_key: (s.facturapi_test_key as string) || "",
      facturapi_live_key: (s.facturapi_live_key as string) || "",
    });
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rfc || !form.razon_social || !form.regimen_fiscal || !form.lugar_expedicion) {
      toast.error("Todos los campos obligatorios deben llenarse");
      return;
    }
    upsert.mutate(
      {
        ...(settings?.id ? { id: settings.id } : {}),
        rfc: form.rfc,
        razon_social: form.razon_social,
        regimen_fiscal: form.regimen_fiscal,
        lugar_expedicion: form.lugar_expedicion,
        logo_url: form.logo_url || null,
        facturapi_mode: form.facturapi_mode || "test",
        facturapi_test_key: form.facturapi_test_key || null,
        facturapi_live_key: form.facturapi_live_key || null,
      },
      { onSuccess: () => toast.success("Datos fiscales guardados") }
    );
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <PageHeader title="Datos Fiscales del Emisor" subtitle="Configuración CFDI 4.0" />
      <form onSubmit={handleSubmit}>
        <CompanyFiscalForm form={form} set={set} isPending={upsert.isPending} />
        <PacConfigForm form={form} set={set} isPending={upsert.isPending} />
      </form>
    </div>
  );
}
