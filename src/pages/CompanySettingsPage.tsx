import { useEffect } from "react";
import { useCompanySettings, useUpsertCompanySettings } from "@/hooks/useCompanySettings";
import { REGIMEN_FISCAL } from "@/lib/satCatalogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormState } from "@/hooks/useFormState";
import { toast } from "sonner";
import { Building2, Save } from "lucide-react";

const empty = { rfc: "", razon_social: "", regimen_fiscal: "", lugar_expedicion: "", logo_url: "" };

export default function CompanySettingsPage() {
  const { data: settings, isLoading } = useCompanySettings();
  const upsert = useUpsertCompanySettings();
  const { form, set, setForm } = useFormState(empty);

  useEffect(() => {
    if (settings) {
      setForm({
        rfc: settings.rfc || "",
        razon_social: settings.razon_social || "",
        regimen_fiscal: settings.regimen_fiscal || "",
        lugar_expedicion: settings.lugar_expedicion || "",
        logo_url: settings.logo_url || "",
      });
    }
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
      },
      { onSuccess: () => toast.success("Datos fiscales guardados") }
    );
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <PageHeader title="Datos Fiscales del Emisor" subtitle="Configuración CFDI 4.0" />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Información Fiscal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>RFC *</Label>
                <Input value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" maxLength={13} />
              </div>
              <div className="space-y-1.5">
                <Label>Razón Social *</Label>
                <Input value={form.razon_social} onChange={(e) => set("razon_social", e.target.value)} placeholder="Mi Empresa S.A. de C.V." />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Régimen Fiscal *</Label>
                <Select value={form.regimen_fiscal} onValueChange={(v) => set("regimen_fiscal", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar régimen" /></SelectTrigger>
                  <SelectContent>
                    {REGIMEN_FISCAL.map((r) => (
                      <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Lugar de Expedición (C.P.) *</Label>
                <Input value={form.lugar_expedicion} onChange={(e) => set("lugar_expedicion", e.target.value)} placeholder="06600" maxLength={5} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>URL del Logo (opcional)</Label>
              <Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://..." />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={upsert.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {upsert.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
