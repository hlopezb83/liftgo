import { useEffect, useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, FileText, UserPlus, CheckCircle2 } from "lucide-react";
import { useQuotes } from "@/hooks/useQuotes";
import { formatCurrency } from "@/lib/formatCurrency";
import { useNavigate } from "react-router-dom";
import type { Prospect } from "@/hooks/useProspects";

const STAGE_LABELS: Record<string, string> = {
  nuevo_prospecto: "Nuevo Prospecto",
  contactado: "Contactado",
  cotizacion_enviada: "Cotización Enviada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado Ganado",
  cerrado_perdido: "Cerrado Perdido",
};

const STAGES_REQUIRING_DEAL_VALUE = ["cotizacion_enviada", "negociacion", "cerrado_ganado", "cerrado_perdido"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect?: Prospect | null;
  defaultStage?: string;
  overrideStage?: string;
  onSave: (data: {
    company_name: string;
    contact_person: string;
    email: string;
    phone: string;
    deal_value: number;
    notes: string;
    stage: string;
    quote_id: string | null;
  }) => void;
  onDelete?: () => void;
}

export function ProspectFormDialog({ open, onOpenChange, prospect, defaultStage = "nuevo_prospecto", overrideStage, onSave, onDelete }: Props) {
  const navigate = useNavigate();
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [notes, setNotes] = useState("");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [dealValueError, setDealValueError] = useState<string | null>(null);

  const { data: allQuotes = [] } = useQuotes();

  // Filter quotes that match prospect's company name (case-insensitive partial match)
  const matchingQuotes = useMemo(() => {
    if (!company.trim()) return allQuotes;
    const lowerCompany = company.toLowerCase();
    return allQuotes.filter(
      (q) =>
        q.customer_name?.toLowerCase().includes(lowerCompany) ||
        lowerCompany.includes(q.customer_name?.toLowerCase() ?? "")
    );
  }, [allQuotes, company]);

  const effectiveStage = overrideStage ?? prospect?.stage ?? defaultStage;
  const requiresDealValue = STAGES_REQUIRING_DEAL_VALUE.includes(effectiveStage);

  useEffect(() => {
    if (prospect) {
      setCompany(prospect.company_name);
      setContact(prospect.contact_person ?? "");
      setEmail(prospect.email ?? "");
      setPhone(prospect.phone ?? "");
      setDealValue(String(prospect.deal_value ?? 0));
      setNotes(prospect.notes ?? "");
      setQuoteId(prospect.quote_id ?? null);
    } else {
      setCompany(""); setContact(""); setEmail(""); setPhone(""); setDealValue(""); setNotes(""); setQuoteId(null);
    }
    setDealValueError(null);
  }, [prospect, open]);

  // When a quote is selected, auto-fill deal_value
  const handleQuoteChange = (value: string) => {
    const selectedId = value === "none" ? null : value;
    setQuoteId(selectedId);
    if (selectedId) {
      const quote = allQuotes.find((q) => q.id === selectedId);
      if (quote) {
        setDealValue(String(quote.total ?? 0));
        setDealValueError(null);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedValue = parseFloat(dealValue) || 0;

    // Validation: deal_value must be > 0 for stages after "contactado"
    if (requiresDealValue && parsedValue <= 0) {
      setDealValueError("El valor del trato debe ser mayor a $0 para esta etapa");
      return;
    }

    onSave({
      company_name: company,
      contact_person: contact,
      email,
      phone,
      deal_value: parsedValue,
      notes,
      stage: effectiveStage,
      quote_id: quoteId,
    });
    onOpenChange(false);
  };

  const selectedQuote = quoteId ? allQuotes.find((q) => q.id === quoteId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prospect ? "Editar Prospecto" : "Nuevo Prospecto"}</DialogTitle>
          <DialogDescription>
            {overrideStage && prospect
              ? "Confirma los datos antes de mover el prospecto de etapa."
              : prospect
                ? "Actualiza la información del prospecto."
                : "Agrega un nuevo prospecto al pipeline."}
          </DialogDescription>
          {overrideStage && prospect && (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <Badge variant="secondary">{STAGE_LABELS[prospect.stage] ?? prospect.stage}</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge>{STAGE_LABELS[overrideStage] ?? overrideStage}</Badge>
            </div>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pb-1 pr-4">
          <div className="space-y-2">
            <Label htmlFor="company">Empresa *</Label>
            <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact">Persona de Contacto</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          {requiresDealValue && (
            <div className="space-y-2">
              <Label htmlFor="quote">Cotización Vinculada</Label>
              <Select value={quoteId ?? "none"} onValueChange={handleQuoteChange}>
                <SelectTrigger id="quote">
                  <SelectValue placeholder="Seleccionar cotización..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cotización</SelectItem>
                  {matchingQuotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5" />
                        {q.quote_number} — {q.customer_name} — {formatCurrency(q.total)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedQuote && (
                <p className="text-xs text-muted-foreground">
                  Cotización por {formatCurrency(selectedQuote.total)} — Estado: {selectedQuote.status}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="deal">
              Valor del Trato (MXN) {requiresDealValue && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="deal"
              type="number"
              min="0"
              step="0.01"
              value={dealValue}
              onChange={(e) => {
                setDealValue(e.target.value);
                setDealValueError(null);
              }}
              className={dealValueError ? "border-destructive" : ""}
            />
            {dealValueError && <p className="text-xs text-destructive">{dealValueError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {prospect && effectiveStage === "cerrado_ganado" && (
            <div className="rounded-lg border border-dashed p-3">
              {prospect.customer_id ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Cliente creado</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="ml-auto p-0 h-auto"
                    onClick={() => navigate(`/customers/${prospect.customer_id}`)}
                  >
                    Ver cliente
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    const params = new URLSearchParams({
                      from_prospect: "true",
                      prospect_id: prospect.id,
                      company: prospect.company_name,
                      contact: prospect.contact_person || "",
                      email: prospect.email || "",
                      phone: prospect.phone || "",
                    });
                    onOpenChange(false);
                    navigate(`/customers?${params.toString()}`);
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                  Convertir a Cliente
                </Button>
              )}
            </div>
          )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex justify-between sm:justify-between pt-4">
            {prospect && onDelete && (
              <Button type="button" variant="destructive" size="sm" onClick={() => { onDelete(); onOpenChange(false); }}>
                Eliminar
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
