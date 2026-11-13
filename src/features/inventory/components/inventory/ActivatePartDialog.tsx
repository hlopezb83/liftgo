import { useId, useState } from "react";
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
  return { catalogPartId, setCatalogPartId, search, setSearch, page, setPage,
    catalogQuery, catalogReady, data, availableCatalog, options, selectedActive };
}

function ActivationForm({ open, onOpenChange }: Props) {
  const activate = useActivateCatalogPart();
  const catalog = useCatalogSelection(open);
  const { catalogPartId, catalogReady, selectedActive } = catalog;
  const [stock, setStock] = useState("0");
  const [minimum, setMinimum] = useState("0");
  const [cost, setCost] = useState("0");
  const [location, setLocation] = useState("");
  const isDirty = !!catalogPartId || stock !== "0" || minimum !== "0" || cost !== "0" || !!location;
  useUnsavedChangesGuard(open && isDirty && !activate.isPending);
  usePrefillEffect(() => {
    if (!open) return;
    setStock("0");
    setMinimum("0");
    setCost("0");
    setLocation("");
  }, [open]);

  const submit = () => {
    if (!catalogReady || activate.isPending) return;
    const values = [Number(stock), Number(minimum), Number(cost)];
    if (!selectedActive) {
      notifyValidation({ message: "Selecciona un SKU del catálogo LiftGo" });
      return;
    }
    if (!Number.isInteger(values[0]) || !Number.isInteger(values[1])) {
      notifyValidation({ message: "Las existencias y el mínimo deben ser enteros" });
      return;
    }
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      notifyValidation({ message: "Existencias, mínimo y costo deben ser valores no negativos" });
      return;
    }
    activate.mutate({
      catalogPartId,
      stockQuantity: values[0],
      minStockLevel: values[1],
      unitCost: values[2],
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
          <Field label="Stock inicial" value={stock} onChange={setStock} type="number" />
          <Field label="Stock mínimo" value={minimum} onChange={setMinimum} type="number" />
          <Field label="Costo unitario" value={cost} onChange={setCost} type="number" />
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
    catalogQuery, catalogReady, data, availableCatalog, options } = catalog;
  const catalogId = useId();
  const searchId = useId();
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / ACTIVATION_CATALOG_PAGE_SIZE));
  return <>
    <div className="space-y-1.5">
      <Label htmlFor={searchId}>Buscar SKU o nombre</Label>
      <Input id={searchId} value={search} disabled={pending}
        onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar en todo el catálogo…" />
    </div>
    <CatalogPicker id={catalogId} catalog={options} value={catalogPartId}
      // Radix may emit an empty value when options unmount during verification.
      onChange={(value) => { if (value) setCatalogPartId(value); }}
      loading={!catalogReady} error={catalogQuery.isError} retrying={catalogQuery.isFetching} pending={pending}
      onRetry={() => { void catalogQuery.refetch(); }} />
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

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} min={type === "number" ? 0 : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
