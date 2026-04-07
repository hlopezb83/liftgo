import { useEffect, useRef, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { Building2, Save, Upload, Trash2, ImageIcon, ShieldCheck, Eye, EyeOff, CheckCircle2, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const empty = {
  rfc: "", razon_social: "", regimen_fiscal: "", lugar_expedicion: "",
  logo_url: "", facturapi_mode: "test", facturapi_test_key: "", facturapi_live_key: "",
};

export default function CompanySettingsPage() {
  const { data: settings, isLoading } = useCompanySettings();
  const upsert = useUpsertCompanySettings();
  const { form, set, setForm } = useFormState(empty);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showTestKey, setShowTestKey] = useState(false);
  const [showLiveKey, setShowLiveKey] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        rfc: settings.rfc || "",
        razon_social: settings.razon_social || "",
        regimen_fiscal: settings.regimen_fiscal || "",
        lugar_expedicion: settings.lugar_expedicion || "",
        logo_url: settings.logo_url || "",
        facturapi_mode: (settings as Record<string, unknown>).facturapi_mode as string || "test",
        facturapi_test_key: (settings as Record<string, unknown>).facturapi_test_key as string || "",
        facturapi_live_key: (settings as Record<string, unknown>).facturapi_live_key as string || "",
      });
    }
  }, [settings]);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo no debe superar 2MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten archivos de imagen");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `company/logo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath);
      set("logo_url", urlData.publicUrl);
      toast.success("Logo subido correctamente");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = () => {
    set("logo_url", "");
  };

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
                  <SelectContent className="max-h-60 overflow-y-auto z-50">
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

            {/* Logo upload section */}
            <div className="space-y-2">
              <Label>Logo de la Empresa (opcional)</Label>
              <div className="flex items-center gap-4">
                {form.logo_url ? (
                  <div className="relative h-16 w-16 rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center">
                    <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-md border border-dashed border-border bg-muted flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleUploadLogo}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading ? "Subiendo..." : "Subir Logo"}
                  </Button>
                  {form.logo_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemoveLogo} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG, WebP o SVG. Máximo 2MB.</p>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={upsert.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {upsert.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* PAC Configuration */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Configuración PAC (Facturapi)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Modo de operación</p>
                <p className="text-xs text-muted-foreground">
                  {form.facturapi_mode === "live"
                    ? "Producción — Las facturas se timbran ante el SAT"
                    : "Prueba — Las facturas se timbran en sandbox de Facturapi"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Test</span>
                <Switch
                  checked={form.facturapi_mode === "live"}
                  onCheckedChange={(checked) => set("facturapi_mode", checked ? "live" : "test")}
                />
                <span className="text-xs text-muted-foreground">Live</span>
              </div>
            </div>

            {/* API Key fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  API Key Test (Sandbox)
                  {form.facturapi_test_key ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type={showTestKey ? "text" : "password"}
                    value={form.facturapi_test_key}
                    onChange={(e) => set("facturapi_test_key", e.target.value)}
                    placeholder="sk_test_..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowTestKey(!showTestKey)}
                  >
                    {showTestKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  API Key Live (Producción)
                  {form.facturapi_live_key ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type={showLiveKey ? "text" : "password"}
                    value={form.facturapi_live_key}
                    onChange={(e) => set("facturapi_live_key", e.target.value)}
                    placeholder="sk_live_..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowLiveKey(!showLiveKey)}
                  >
                    {showLiveKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Obtén tus API keys en <a href="https://dashboard.facturapi.io" target="_blank" rel="noopener noreferrer" className="underline">dashboard.facturapi.io</a>. Si no se configuran, el sistema opera en modo stub (sin conexión al SAT).
            </p>

            <div className="pt-2">
              <Button type="submit" disabled={upsert.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {upsert.isPending ? "Guardando..." : "Guardar Configuración"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
