import { useEffect } from "react";
import {
  useCompanySettings,
  useUpsertCompanySettings,
  useBillingSecrets,
  useUpsertBillingSecrets,
} from "@/features/company-settings/hooks/useCompanySettings";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormState } from "@/hooks/useFormState";
import { toast } from "sonner";
import { CompanyFiscalForm } from "@/features/company-settings/components/company-settings/CompanyFiscalForm";
import { PacConfigForm } from "@/features/company-settings/components/company-settings/PacConfigForm";

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
    if (!settings) return;
    const s = settings as Record<string, unknown>;
    setForm({
      rfc: (s.rfc as string) || "",
      razon_social: (s.razon_social as string) || "",
      regimen_fiscal: (s.regimen_fiscal as string) || "",
      lugar_expedicion: (s.lugar_expedicion as string) || "",
      logo_url: (s.logo_url as string) || "",
      facturapi_mode: (s.facturapi_mode as string) || "test",
      // Las llaves nunca se devuelven al cliente: arrancan vacías y solo
      // se envían al backend si el usuario captura un valor nuevo.
      facturapi_test_key: "",
      facturapi_live_key: "",
    });
  }, [settings, setForm]);

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
      const hasNewTest = form.facturapi_test_key.length > 0;
      const hasNewLive = form.facturapi_live_key.length > 0;
      if (hasNewTest || hasNewLive) {
        await upsertSecrets.mutateAsync({
          ...(secrets?.id ? { id: secrets.id } : {}),
          facturapi_test_key: hasNewTest ? form.facturapi_test_key : null,
          facturapi_live_key: hasNewLive ? form.facturapi_live_key : null,
        });
        setForm({ ...form, facturapi_test_key: "", facturapi_live_key: "" });
      }
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
      <PacConfigForm
        form={form}
        set={set}
        isPending={isPending}
        hasTestKey={!!secrets?.has_test_key}
        hasLiveKey={!!secrets?.has_live_key}
      />
    </form>
  );
}
