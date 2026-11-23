import { useId, useRef, useState, type Ref } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { ACTIVATION_CATALOG_PAGE_SIZE, useActivationCatalogPage, type ActivationCatalogPart } from "../../hooks/useActivationCatalogPage";
import { useActivateCatalogPart } from "../../hooks/usePartInventoryMutations";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ActivatePartDialog(props: Props) {
  const identity = useVerifiedIdentityScope();
  return <ActivationForm key={identity} {...props} />;
}

function useCatalogSelection(open: boolean) {
  const [catalogPartId, setCatalogPartId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim());
  const catalogQuery = useActivationCatalogPage({ open, search: debouncedSearch, page, selectedId: catalogPartId });
  const catalogReady = catalogQuery.isReady && search.trim() === debouncedSearch;
  const data = catalogReady ? catalogQuery.data : undefined;
  const availableCatalog = data?.items ?? [];
  const selected = data?.selected;
  const options = selected && !availableCatalog.some((part) => part.id === selected.id)
    ? [selected, ...availableCatalog] : availableCatalog;
  const selectedActive = catalogReady && selected?.id === catalogPartId;
  usePrefillEffect(() => {
    if (data && data.pageIndex !== page) setPage(data.pageIndex);
  }, [data?.pageIndex]);
  usePrefillEffect(() => {
    if (!open) return;
    setCatalogPartId("");
    setSearch("");
    setPage(0);
  }, [open]);
  const selectedUnavailable = catalogReady && !!catalogPartId && !selectedActive;
  return { catalogPartId, setCatalogPartId, search, setSearch, page, setPage,
    catalogQuery, catalogReady, data, availableCatalog, options, selectedActive, selectedUnavailable };
}

const ACTIVATION_NUMBER_FIELDS = [
  { key: "stock", label: "Stock inicial" },
  { key: "minimum", label: "Stock mínimo" },
  { key: "cost", label: "Costo unitario" },
] as const;

type ActivationNumberField = (typeof ACTIVATION_NUMBER_FIELDS)[number]["key"];

function activationNumberError(key: ActivationNumberField, value: number) {
  if (!Number.isFinite(value) || value < 0) return "Ingresa un número mayor o igual a 0.";
  if (key !== "cost" && !Number.isInteger(value)) return "Ingresa un número entero.";
  return undefined;
}

function ActivationForm({ open, onOpenChange }: Props) {
  const activate = useActivateCatalogPart();
  const catalog = useCatalogSelection(open);
  const { catalogPartId, catalogReady, selectedActive } = catalog;
  const [numbers, setNumbers] = useState({ stock: "0", minimum: "0", cost: "0" });
  const [showNumberErrors, setShowNumberErrors] = useState(false);
  const numberInputs = useRef<Partial<Record<ActivationNumberField, HTMLInputElement | null>>>({});
  const [location, setLocation] = useState("");
  const isDirty = !!catalogPartId || Object.values(numbers).some((value) => value !== "0") || !!location;
  useUnsavedChangesGuard(open && isDirty && !activate.isPending);
  usePrefillEffect(() => {
    if (!open) return;
    setNumbers({ stock: "0", minimum: "0", cost: "0" });
    setShowNumberErrors(false);
    setLocation("");
  }, [open]);

  const submit = () => {
    if (!catalogReady || activate.isPending) return;
    if (!selectedActive) {
      notifyValidation({ message: "Selecciona un SKU del catálogo LiftGo" });
      return;
    }
    const invalid = ACTIVATION_NUMBER_FIELDS.find(({ key }) => activationNumberError(key, Number(numbers[key])));
    if (invalid) {
      setShowNumberErrors(true);
      numberInputs.current[invalid.key]?.focus();
      return;
    }
    activate.mutate({
      catalogPartId,
      stockQuantity: Number(numbers.stock),
      minStockLevel: Number(numbers.minimum),
      unitCost: Number(numbers.cost),
      location: location || null,
    }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Habilitar refacción"
      description="Selecciona un SKU global y captura únicamente la configuración de esta empresa."
      isPending={activate.isPending}
      isDirty={isDirty}
    >
      <div className="grid gap-4 py-2">
        <CatalogSearchPicker catalog={catalog} pending={activate.isPending} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ACTIVATION_NUMBER_FIELDS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              value={numbers[key]}
              onChange={(value) => setNumbers((previous) => ({ ...previous, [key]: value }))}
              type="number"
              error={showNumberErrors ? activationNumberError(key, Number(numbers[key])) : undefined}
              inputRef={(input) => { numberInputs.current[key] = input; }}
            />
          ))}
        </div>
        <Field label="Ubicación" value={location} onChange={setLocation} placeholder="Ej. Pasillo A · Estante 3" />
      </div>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={activate.isPending} />
        <Button onClick={submit} disabled={activate.isPending || !selectedActive}>Habilitar</Button>
      </FormDialogFooter>
    </FormDialog>
  );
}

function CatalogSearchPicker({ catalog, pending }: { catalog: ReturnType<typeof useCatalogSelection>; pending: boolean }) {
  const { catalogPartId, setCatalogPartId, search, setSearch, page, setPage,
    catalogQuery, catalogReady, data, availableCatalog, options, selectedUnavailable } = catalog;
  const catalogId = useId();
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / ACTIVATION_CATALOG_PAGE_SIZE));
  return <>
    <div className="space-y-1.5">
      <Label htmlFor={searchId}>Buscar SKU o nombre</Label>
      <Input ref={searchRef} id={searchId} value={search} disabled={pending}
        onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar en todo el catálogo…" />
    </div>
    <CatalogPicker id={catalogId} catalog={options} value={catalogPartId}
      // Radix may emit an empty value when options unmount during verification.
      onChange={(value) => { if (value) setCatalogPartId(value); }}
      loading={!catalogReady} error={catalogQuery.isError} retrying={catalogQuery.isFetching} pending={pending}
      onRetry={() => { void catalogQuery.refetch(); }} />
    {selectedUnavailable && (
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="text-sm text-muted-foreground">El SKU seleccionado ya no está disponible para habilitar.</p>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => {
          setCatalogPartId("");
          setSearch("");
          setPage(0);
          searchRef.current?.focus();
        }}>Elegir otro SKU</Button>
      </div>
    )}
    {catalogReady && availableCatalog.length === 0 && <p className="text-sm text-muted-foreground">
      {data?.totalCount === 0 ? "No hay SKUs activos que coincidan con la búsqueda." : "Los SKUs de esta página ya están habilitados. Busca otro SKU o cambia de página."}
    </p>}
    <div className="flex items-center justify-between gap-2" aria-label="Paginación del catálogo">
      <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={!catalogReady || pending || page === 0}>Anterior</Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">{catalogReady ? `Página ${page + 1} de ${totalPages}` : catalogQuery.isError ? "Catálogo no disponible" : "Cargando catálogo…"}</span>
      <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={!catalogReady || pending || page + 1 >= totalPages}>Siguiente</Button>
    </div>
  </>;
}

function CatalogPicker({ id, catalog, value, onChange, loading, error, retrying, pending, onRetry }: {
  id: string; catalog: ActivationCatalogPart[]; value: string; onChange: (value: string) => void;
  loading: boolean; error: boolean; retrying: boolean; pending: boolean; onRetry: () => void;
}) {
  if (error) return <QueryErrorState entity="el catálogo LiftGo" bare isRetrying={retrying} onRetry={onRetry} />;
  return <div className="space-y-1.5">
    <Label htmlFor={id}>SKU LiftGo *</Label>
    <Select value={value} onValueChange={onChange} disabled={loading || catalog.length === 0 || pending}>
      <SelectTrigger id={id}><SelectValue placeholder={loading ? "Cargando…" : catalog.length === 0 ? "Sin SKUs disponibles" : "Seleccionar SKU"} /></SelectTrigger>
      <SelectContent>
        {catalog.map((part) => <SelectItem key={part.id} value={part.id}>{part.sku} · {part.name}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

function Field({ label, value, onChange, type = "text", placeholder, error, inputRef }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={inputRef}
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
