import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { SecurityIcon, SaveIcon, ViewIcon, HideIcon, SuccessIcon, WarnIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormItem, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface PacFormValues {
  facturapi_mode: string;
  facturapi_test_key: string;
  facturapi_live_key: string;
}

interface Props {
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
          ? <SuccessIcon className="h-3.5 w-3.5 text-success" />
          : <WarnIcon className="h-3.5 w-3.5 text-warning" />}
        {isConfigured && !value && (
          <span className="text-3xs uppercase tracking-wide text-muted-foreground ml-1">
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
          {show ? <HideIcon className="h-4 w-4" /> : <ViewIcon className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function PacConfigForm({ isPending, hasTestKey, hasLiveKey }: Props) {
  const form = useFormContext<PacFormValues>();
  const mode = useWatch({ control: form.control, name: "facturapi_mode" });
  const isLive = mode === "live";
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <SecurityIcon className="h-4 w-4" /> Configuración PAC (Facturapi)
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
            <span className="text-xs text-muted-foreground">Pruebas</span>
            <FormField control={form.control} name="facturapi_mode" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Switch
                    checked={field.value === "live"}
                    onCheckedChange={(checked) => field.onChange(checked ? "live" : "test")}
                  />
                </FormControl>
              </FormItem>
            )} />
            <span className="text-xs text-muted-foreground">Producción</span>
          </div>
        </div>

        <div className="space-y-3">
          <FormField control={form.control} name="facturapi_test_key" render={({ field }) => (
            <ApiKeyField
              label="API Key Test (Sandbox)"
              value={field.value}
              onChange={field.onChange}
              placeholder="sk_test_..."
              isConfigured={hasTestKey}
            />
          )} />
          <FormField control={form.control} name="facturapi_live_key" render={({ field }) => (
            <ApiKeyField
              label="API Key Live (Producción)"
              value={field.value}
              onChange={field.onChange}
              placeholder="sk_live_..."
              isConfigured={hasLiveKey}
            />
          )} />
        </div>

        <p className="text-xs text-muted-foreground">
          Por seguridad, las llaves nunca se descargan al navegador. Solo se muestra si están configuradas; captura un valor para reemplazarlas.
        </p>

        <div className="pt-2">
          <Button type="submit" disabled={isPending}>
            <SaveIcon className="h-4 w-4 mr-1" />
            {isPending ? "Guardando…" : "Guardar Configuración"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
