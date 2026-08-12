import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { CsfDropzone } from "@/components/forms/CsfDropzone";
import { SectionHeading } from "@/components/forms/SectionHeading";
import { Lock } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyFiscalForm, PacConfigForm, useBillingSecrets, useCompanySettings, useUpsertBillingSecrets, useUpsertCompanySettings } from "@/features/company-settings";
import type { ParsedCsfData } from "@/features/customers";
import { useUserRole } from "@/features/users";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { fiscalSchema, type FiscalDataValues } from "../../lib/operationsSchemas";

const defaultValues: FiscalDataValues = {
  rfc: "", razon_social: "", regimen_fiscal: "", lugar_expedicion: "",
  logo_url: "", facturapi_mode: "test", facturapi_test_key: "", facturapi_live_key: "",
};

export function FiscalDataTab() {
  const { data: role, isLoading: isLoadingRole } = useUserRole();
  const isAdmin = role === "admin";

  const { data: settings, isLoading, isError: settingsError, refetch: refetchSettings } = useCompanySettings();
  const { data: secrets, isLoading: isLoadingSecrets, isError: secretsError, refetch: refetchSecrets } = useBillingSecrets();
  const upsert = useUpsertCompanySettings();
  const upsertSecrets = useUpsertBillingSecrets();
  const form = useForm<FiscalDataValues>({
    resolver: zodResolver(fiscalSchema),
    defaultValues,
  });

  // Mapea la CSF del SAT a los campos del emisor. El CP fiscal es el lugar
  // de expedición del CFDI.
  const mapCsf = useCallback((data: ParsedCsfData): Partial<FiscalDataValues> => ({
    rfc: data.rfc || undefined,
    razon_social: data.razon_social || data.name || undefined,
    regimen_fiscal: data.regimen_fiscal || undefined,
    lugar_expedicion: data.domicilio_fiscal_cp || undefined,
  }), []);

  // No guardamos automáticamente: sólo precargamos para que el admin revise.
  const handleCsfParsed = useCallback((patch: Partial<FiscalDataValues>) => {
    (Object.entries(patch) as [keyof FiscalDataValues, string | undefined][]).forEach(([key, value]) => {
      if (value) form.setValue(key, value, { shouldDirty: true, shouldValidate: true });
    });
  }, [form]);

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

  // A3-02: sin esta rama el formulario fiscal aparecía vacío y editable
  // tras un error de red, invitando a sobreescribir la configuración real.
  if (settingsError || secretsError) {
    return (
      <QueryErrorState
        bare
        entity="los datos fiscales"
        onRetry={() => { void refetchSettings(); void refetchSecrets(); }}
      />
    );
  }

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
