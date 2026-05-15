import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck, Save, Eye, EyeOff, CheckCircle2, AlertTriangle } from "lucide-react";

interface PacFormValues {
  facturapi_mode: string;
  facturapi_test_key: string;
  facturapi_live_key: string;
}

interface Props {
  form: PacFormValues;
  set: <K extends keyof PacFormValues>(key: K, value: PacFormValues[K]) => void;
  isPending: boolean;
  hasTestKey?: boolean;
  hasLiveKey?: boolean;
}

interface KeyFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  isConfigured?: boolean;
}

function ApiKeyField({ label, value, onChange, placeholder, isConfigured }: KeyFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {(isConfigured || value)
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          : <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />}
        {isConfigured && !value && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-1">
            configurada
          </span>
        )}
      </Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isConfigured ? "•••••••• (capturar para reemplazar)" : placeholder}
          className="pr-10"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function PacConfigForm({ form, set, isPending }: Props) {
  const isLive = form.facturapi_mode === "live";
  return (
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
              {isLive
                ? "Producción — Las facturas se timbran ante el SAT"
                : "Prueba — Las facturas se timbran en sandbox de Facturapi"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Test</span>
            <Switch
              checked={isLive}
              onCheckedChange={(checked) => set("facturapi_mode", checked ? "live" : "test")}
            />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>

        <div className="space-y-3">
          <ApiKeyField
            label="API Key Test (Sandbox)"
            value={form.facturapi_test_key}
            onChange={(v) => set("facturapi_test_key", v)}
            placeholder="sk_test_..."
          />
          <ApiKeyField
            label="API Key Live (Producción)"
            value={form.facturapi_live_key}
            onChange={(v) => set("facturapi_live_key", v)}
            placeholder="sk_live_..."
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Obtén tus API keys en <a href="https://dashboard.facturapi.io" target="_blank" rel="noopener noreferrer" className="underline">dashboard.facturapi.io</a>. Si no se configuran, el sistema opera en modo stub (sin conexión al SAT).
        </p>

        <div className="pt-2">
          <Button type="submit" disabled={isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? "Guardando..." : "Guardar Configuración"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
