import { useEffect } from "react";
import { useCompanySettings, useUpsertCompanySettings } from "@/hooks/useCompanySettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormState } from "@/hooks/useFormState";
import { toast } from "sonner";
import { Image as ImageIcon, Save } from "lucide-react";
import { LogoUploader } from "@/components/company-settings/LogoUploader";

export function CompanyLogoTab() {
  const { data: settings, isLoading } = useCompanySettings();
  const upsert = useUpsertCompanySettings();
  const { form, set, setForm } = useFormState({ logo_url: "" });

  useEffect(() => {
    if (!settings) return;
    setForm({ logo_url: settings.logo_url || "" });
  }, [settings]);

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
        logo_url: form.logo_url || null,
      },
      { onSuccess: () => toast.success("Logo guardado") }
    );
  };

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Logo de la Empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LogoUploader logoUrl={form.logo_url} onChange={(url) => set("logo_url", url)} />
          <p className="text-xs text-muted-foreground">
            El logo aparece en facturas, cotizaciones, contratos y otros documentos PDF. Tamaño recomendado: máximo 24×40 mm.
          </p>
          <div className="pt-2">
            <Button type="submit" disabled={upsert.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {upsert.isPending ? "Guardando..." : "Guardar Logo"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
