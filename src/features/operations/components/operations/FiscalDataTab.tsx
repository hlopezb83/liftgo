import { useEffect } from "react";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useForm } from "react-hook-form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { CompanyFiscalForm, PacConfigForm, useBillingSecrets, useCompanySettings, useUpsertBillingSecrets, useUpsertCompanySettings } from "@/features/company-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { Form } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lock } from "@/components/icons";
import { useUserRole } from "@/features/users";

import { fiscalSchema, type FiscalDataValues } from "../../lib/operationsSchemas";

const defaultValues: FiscalDataValues = {
  rfc: "", razon_social: "", regimen_fiscal: "", lugar_expedicion: "",
  logo_url: "", facturapi_mode: "test", facturapi_test_key: "", facturapi_live_key: "",
};

export function FiscalDataTab() {
  const { data: role, isLoading: isLoadingRole } = useUserRole();
  const isAdmin = role === "admin";

  const { data: settings, isLoading } = useCompanySettings();
  const { data: secrets, isLoading: isLoadingSecrets } = useBillingSecrets();
  const upsert = useUpsertCompanySettings();
  const upsertSecrets = useUpsertBillingSecrets();
  const form = useForm<FiscalDataValues>({
    resolver: zodResolver(fiscalSchema),
    defaultValues,
  });

  useEffect(() => {
    if (!settings) return;
    const s = settings as Record<string, unknown>;
    form.reset({
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
  }, [settings, form]);

  const onSubmit = async (values: FiscalDataValues) => {
    try {
      await upsert.mutateAsync({
        ...(settings?.id ? { id: settings.id } : {}),
        rfc: values.rfc,
        razon_social: values.razon_social,
        regimen_fiscal: values.regimen_fiscal,
        lugar_expedicion: values.lugar_expedicion,
        logo_url: values.logo_url || null,
        facturapi_mode: values.facturapi_mode || "test",
      });

      const hasNewTest = values.facturapi_test_key.length > 0;
      const hasNewLive = values.facturapi_live_key.length > 0;
      if (hasNewTest || hasNewLive) {
        await upsertSecrets.mutateAsync({
          ...(secrets?.id ? { id: secrets.id } : {}),
          facturapi_test_key: hasNewTest ? values.facturapi_test_key : null,
          facturapi_live_key: hasNewLive ? values.facturapi_live_key : null,
        });
        form.setValue("facturapi_test_key", "");
        form.setValue("facturapi_live_key", "");
      }
      notifySuccess("Datos fiscales guardados");
    } catch (err) {
      notifyError({ error: err, message: "No se pudieron guardar los datos fiscales" });
    }
  };

  if (isLoadingRole || isLoading || isLoadingSecrets) return <Skeleton className="h-64" />;

  if (!isAdmin) {
    return (
      <Alert className="max-w-3xl">
        <Lock className="h-4 w-4" />
        <AlertTitle>Acceso restringido</AlertTitle>
        <AlertDescription>
          Solo un usuario con rol Admin puede editar los datos fiscales y las llaves del PAC.
          Pide a un administrador que realice estos cambios.
        </AlertDescription>
      </Alert>
    );
  }

  const isPending = upsert.isPending || upsertSecrets.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
        <CompanyFiscalForm isPending={isPending} />
        <PacConfigForm
          isPending={isPending}
          hasTestKey={!!secrets?.has_test_key}
          hasLiveKey={!!secrets?.has_live_key}
        />
      </form>
    </Form>
  );
}
