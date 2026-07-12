import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Image as ImageIcon, SaveIcon, SuccessIcon, InfoAlertIcon, ImageOff } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoUploader, useCompanySettings, useUpsertCompanySettings } from "@/features/company-settings";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { logoSchema, type LogoFormValues } from "../../lib/operationsSchemas";

export function CompanyLogoTab() {
  const { data: settings, isLoading } = useCompanySettings();
  const upsert = useUpsertCompanySettings();
  const form = useForm<LogoFormValues>({
    resolver: zodResolver(logoSchema),
    defaultValues: { logo_url: "" },
  });

  useEffect(() => {
    if (!settings) return;
    form.reset({ logo_url: settings.logo_url || "" });
  }, [settings, form]);

  const savedUrl = settings?.logo_url || "";
  const pendingUrl = form.watch("logo_url") || "";
  const hasSaved = !!savedUrl;
  const hasPendingChange = pendingUrl !== savedUrl;

  const onSubmit = (values: LogoFormValues) => {
    if (!settings?.id) {
      notifyValidation({ message: "Primero captura tus datos fiscales" });
      return;
    }
    upsert.mutate(
      {
        id: settings.id,
        rfc: settings.rfc || "",
        razon_social: settings.razon_social || "",
        regimen_fiscal: settings.regimen_fiscal || "",
        lugar_expedicion: settings.lugar_expedicion || "",
        logo_url: values.logo_url || null,
      },
      { onSuccess: () => notifySuccess("Logo guardado") }
    );
  };

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Logo de la Empresa
            </CardTitle>
            {hasSaved ? (
              <Badge variant="outline" className="gap-1 text-success border-success/30">
                <SuccessIcon className="h-3.5 w-3.5" /> Logo guardado
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <ImageOff className="h-3.5 w-3.5" /> Sin logo
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="logo_url"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <LogoUploader logoUrl={field.value} onChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {hasPendingChange && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-warning dark:text-warning text-sm font-medium">
                  <InfoAlertIcon className="h-4 w-4" />
                  Cambios sin guardar — vista previa
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Actual</p>
                    <div className="h-24 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden">
                      {savedUrl ? (
                        <img src={savedUrl} alt="Logo actual" className="h-full w-full object-contain p-2" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin logo</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Nuevo</p>
                    <div className="h-24 rounded-md border border-warning/30 bg-background flex items-center justify-center overflow-hidden">
                      {pendingUrl ? (
                        <img src={pendingUrl} alt="Nuevo logo" className="h-full w-full object-contain p-2" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin logo</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              El logo aparece en facturas, cotizaciones, contratos y otros documentos PDF. Tamaño recomendado: máximo 24×40 mm.
            </p>
            <div className="pt-2">
              <Button type="submit" disabled={upsert.isPending || !hasPendingChange}>
                <SaveIcon className="h-4 w-4 mr-1" />
                {upsert.isPending ? "Guardando..." : "Guardar Logo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
