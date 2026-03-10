import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormActions } from "@/components/FormActions";
import { useFormState } from "@/hooks/useFormState";
import { customerFormSchema, type CustomerFormData } from "@/lib/formSchemas";
import { REGIMEN_FISCAL, USO_CFDI } from "@/lib/satCatalogs";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const emptyCustomer: CustomerFormData = {
  name: "", email: "", phone: "", address: "", notes: "",
  website: "", contact_person: "",
  rfc: "", regimen_fiscal: "", uso_cfdi: "", domicilio_fiscal_cp: "",
  representante_legal: "",
};

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<CustomerFormData>;
  isEdit?: boolean;
  isPending?: boolean;
  onSubmit: (data: CustomerFormData) => void;
}

export function CustomerFormDialog({ open, onOpenChange, initialData, isEdit, isPending, onSubmit }: CustomerFormDialogProps) {
  const { form, set, setForm, reset } = useFormState(emptyCustomer);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [tab, setTab] = useState("manual");

  useEffect(() => {
    if (open && initialData) {
      setForm({ ...emptyCustomer, ...initialData });
    } else if (open && !initialData) {
      reset();
      setParsed(false);
      setTab("manual");
    }
  }, [open]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Solo se aceptan archivos PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo no debe superar 10 MB");
      return;
    }

    setParsing(true);
    setParsed(false);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke("parse-csf", {
        body: { pdf_base64: base64 },
      });

      if (error) throw new Error(error.message || "Error al procesar CSF");
      if (data?.error) throw new Error(data.error);

      setForm((prev) => ({
        ...prev,
        name: data.name || prev.name,
        rfc: data.rfc || prev.rfc,
        domicilio_fiscal_cp: data.domicilio_fiscal_cp || prev.domicilio_fiscal_cp,
        address: data.address || prev.address,
        regimen_fiscal: data.regimen_fiscal || prev.regimen_fiscal,
        representante_legal: data.representante_legal || prev.representante_legal,
      }));
      setParsed(true);
      toast.success("Datos fiscales extraídos. Revisa y completa la información.");
    } catch (e: any) {
      console.error("CSF parse error:", e);
      toast.error(e.message || "Error al procesar la constancia");
    } finally {
      setParsing(false);
    }
  }, [setForm]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: parsing,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedResult = customerFormSchema.safeParse(form);
    if (!parsedResult.success) { toast.error(parsedResult.error.issues[0].message); return; }
    onSubmit(form);
  };

  const formFields = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Identidad</p>
        <div className="space-y-1.5">
          <Label>Nombre / Empresa *</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Montacargas del Norte S.A." />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Datos Fiscales (CFDI)</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>RFC</Label>
            <Input value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" maxLength={13} />
          </div>
          <div className="space-y-1.5">
            <Label>C.P. Fiscal</Label>
            <Input value={form.domicilio_fiscal_cp} onChange={(e) => set("domicilio_fiscal_cp", e.target.value)} placeholder="06600" maxLength={5} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Régimen Fiscal</Label>
            <Select value={form.regimen_fiscal} onValueChange={(v) => set("regimen_fiscal", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {REGIMEN_FISCAL.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Uso CFDI</Label>
            <Select value={form.uso_cfdi} onValueChange={(v) => set("uso_cfdi", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {USO_CFDI.map((u) => (
                  <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Contacto</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Persona de Contacto</Label><Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="María García" /></div>
          <div className="space-y-1.5"><Label>Representante Legal (opcional)</Label><Input value={form.representante_legal} onChange={(e) => set("representante_legal", e.target.value)} placeholder="Lic. Juan Pérez" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Correo</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contacto@empresa.com" /></div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+52 55 1234 5678" /></div>
        </div>
        <div className="space-y-1.5"><Label>Sitio Web</Label><Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" /></div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Direcciones</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Dirección</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Av. Reforma 123" /></div>
          <div className="space-y-1.5"><Label>Dirección de Facturación</Label><Input value={form.billing_address} onChange={(e) => set("billing_address", e.target.value)} placeholder="Calle Facturación 456" /></div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Interno</p>
        <div className="space-y-1.5"><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notas adicionales..." rows={3} /></div>
      </div>

      <FormActions submitLabel={isEdit ? "Guardar Cambios" : "Agregar Cliente"} isPending={isPending} onCancel={() => onOpenChange(false)} />
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar Cliente" : "Agregar Cliente"}</DialogTitle></DialogHeader>

        {isEdit ? (
          formFields
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="manual" className="flex-1">Llenar manualmente</TabsTrigger>
              <TabsTrigger value="csf" className="flex-1">Importar desde CSF</TabsTrigger>
            </TabsList>

            <TabsContent value="manual">
              {formFields}
            </TabsContent>

            <TabsContent value="csf" className="space-y-4">
              {!parsed ? (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                  } ${parsing ? "pointer-events-none opacity-60" : ""}`}
                >
                  <input {...getInputProps()} />
                  {parsing ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground">Extrayendo datos fiscales...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Arrastra tu CSF aquí o haz clic para seleccionar</p>
                        <p className="text-xs text-muted-foreground mt-1">Constancia de Situación Fiscal del SAT (PDF)</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Datos extraídos correctamente</p>
                    <p className="text-xs text-muted-foreground">Revisa y completa los campos faltantes antes de guardar.</p>
                  </div>
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              )}

              {formFields}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
