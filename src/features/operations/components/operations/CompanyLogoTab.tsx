import { useEffect } from "react";
import { useCompanySettings, useUpsertCompanySettings } from "@/hooks/useCompanySettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useFormState } from "@/hooks/useFormState";
import { toast } from "sonner";
import { Image as ImageIcon, Save, CheckCircle2, AlertCircle, ImageOff } from "lucide-react";
import { LogoUploader } from "@/components/company-settings/LogoUploader";

export function CompanyLogoTab() {
  const { data: settings, isLoading } = useCompanySettings();
  const upsert = useUpsertCompanySettings();
  const { form, set, setForm } = useFormState({ logo_url: "" });

  useEffect(() => {
    if (!settings) return;
    setForm({ logo_url: settings.logo_url || "" });
    // setForm es estable (referencia de useFormState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const savedUrl = settings?.logo_url || "";
  const pendingUrl = form.logo_url || "";
  const hasSaved = !!savedUrl;
  const hasPendingChange = pendingUrl !== savedUrl;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings?.id) {
      toast.error("Primero captura tus datos fiscales");
      return;
    }
    upsert.mutate(
      {
        id: settings.id,
        rfc: settings.rfc || "",
        razon_social: settings.razon_social || "",
        regimen_fiscal: settings.regimen_fiscal || "",
        lugar_expedicion: settings.lugar_expedicion || "",
        logo_url: pendingUrl || null,
      },
      { onSuccess: () => toast.success("Logo guardado") }
    );
  };

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Logo de la Empresa
          </CardTitle>
          {hasSaved ? (
            <Badge variant="outline" className="gap-1 text-green-600 border-green-600/30">
              <CheckCircle2 className="h-3.5 w-3.5" /> Logo guardado
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <ImageOff className="h-3.5 w-3.5" /> Sin logo
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <LogoUploader logoUrl={pendingUrl} onChange={(url) => set("logo_url", url)} />

          {hasPendingChange && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-500 text-sm font-medium">
                <AlertCircle className="h-4 w-4" />
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
                  <div className="h-24 rounded-md border border-amber-500/40 bg-background flex items-center justify-center overflow-hidden">
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
              <Save className="h-4 w-4 mr-1" />
              {upsert.isPending ? "Guardando..." : "Guardar Logo"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
