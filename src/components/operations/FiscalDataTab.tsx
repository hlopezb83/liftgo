import { useEffect } from "react";
import {
  useCompanySettings,
  useUpsertCompanySettings,
  useBillingSecrets,
  useUpsertBillingSecrets,
} from "@/hooks/useCompanySettings";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormState } from "@/hooks/useFormState";
import { toast } from "sonner";
import { CompanyFiscalForm } from "@/components/company-settings/CompanyFiscalForm";
import { PacConfigForm } from "@/components/company-settings/PacConfigForm";

const empty = {
  rfc: "", razon_social: "", regimen_fiscal: "", lugar_expedicion: "",
  logo_url: "", facturapi_mode: "test", facturapi_test_key: "", facturapi_live_key: "",
};

export function FiscalDataTab() {
  const { data: settings, isLoading } = useCompanySettings();
  const { data: secrets, isLoading: isLoadingSecrets } = useBillingSecrets();
  const upsert = useUpsertCompanySettings();
  const upsertSecrets = useUpsertBillingSecrets();
  const { form, set, setForm } = useFormState(empty);

  useEffect(() => {
    if (!settings && !secrets) return;
    const s = (settings ?? {}) as Record<string, unknown>;
    setForm({
      rfc: (s.rfc as string) || "",
      razon_social: (s.razon_social as string) || "",
      regimen_fiscal: (s.regimen_fiscal as string) || "",
      lugar_expedicion: (s.lugar_expedicion as string) || "",
      logo_url: (s.logo_url as string) || "",
      facturapi_mode: (s.facturapi_mode as string) || "test",
      facturapi_test_key: (secrets?.facturapi_test_key as string | null | undefined) ?? "",
      facturapi_live_key: (secrets?.facturapi_live_key as string | null | undefined) ?? "",
    });
  }, [settings, secrets, setForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rfc || !form.razon_social || !form.regimen_fiscal || !form.lugar_expedicion) {
      toast.error("Todos los campos obligatorios deben llenarse");
      return;
    }
    try {
      await upsert.mutateAsync({
        ...(settings?.id ? { id: settings.id } : {}),
        rfc: form.rfc,
        razon_social: form.razon_social,
        regimen_fiscal: form.regimen_fiscal,
        lugar_expedicion: form.lugar_expedicion,
        logo_url: form.logo_url || null,
        facturapi_mode: form.facturapi_mode || "test",
      });
      await upsertSecrets.mutateAsync({
        ...(secrets?.id ? { id: secrets.id } : {}),
        facturapi_test_key: form.facturapi_test_key || null,
        facturapi_live_key: form.facturapi_live_key || null,
      });
      toast.success("Datos fiscales guardados");
    } catch (_err) {
      toast.error("No se pudieron guardar los datos fiscales");
    }
  };

  if (isLoading || isLoadingSecrets) return <Skeleton className="h-64" />;

  const isPending = upsert.isPending || upsertSecrets.isPending;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <CompanyFiscalForm form={form} set={set} isPending={isPending} />
      <PacConfigForm form={form} set={set} isPending={isPending} />
    </form>
  );
}
