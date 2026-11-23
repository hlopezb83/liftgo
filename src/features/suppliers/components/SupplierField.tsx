import { type FieldPath, type FieldValues, type Control } from "react-hook-form";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { Button } from "@/components/ui/button";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSuppliers } from "../hooks/useSuppliers";

interface SupplierFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Si true, incluye opción "Sin proveedor" que persiste null. */
  allowEmpty?: boolean;
  className?: string;
}

const EMPTY = "_none";

export function SupplierField<TFieldValues extends FieldValues>({
  control,
  name,
  label = "Proveedor",
  description,
  required,
  disabled,
  allowEmpty = false,
  className,
}: SupplierFieldProps<TFieldValues>) {
  const { data: suppliers, isLoading, isError, isFetching, refetch } = useSuppliers();
  const noSuppliers = !isError && suppliers?.length === 0;
  const unavailable = disabled || isLoading || isError || (noSuppliers && !allowEmpty);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const rawValue = (field.value as string | null | undefined) ?? "";
        const value = rawValue === "" && allowEmpty ? EMPTY : rawValue;
        const unknownSelection = rawValue && !suppliers?.some((supplier) => supplier.id === rawValue);
        return (
          <FormItem className={className}>
            <FormLabel>
              {label}
              {required && <RequiredMark />}
            </FormLabel>
            <Select
              value={value}
              onValueChange={(v) => field.onChange(v === EMPTY ? null : v)}
              disabled={unavailable}
            >
              <FormControl>
                <SelectTrigger aria-required={required || undefined}>
                  <SelectValue placeholder={isLoading ? "Cargando…" : "Seleccionar proveedor"}>
                    {unknownSelection ? "Proveedor seleccionado" : undefined}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {allowEmpty && <SelectItem value={EMPTY}>Sin proveedor</SelectItem>}
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SupplierOptionsStatus
              description={description}
              noSuppliers={noSuppliers}
              isError={isError}
              retryDisabled={disabled || isFetching}
              onRetry={() => { void refetch(); }}
            />
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function SupplierOptionsStatus({ description, noSuppliers, isError, retryDisabled, onRetry }: {
  description?: string;
  noSuppliers: boolean;
  isError: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
}) {
  return <>
    {isError && (
      <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-xs text-destructive">No se pudo cargar el catálogo de proveedores.</p>
        <Button type="button" variant="outline" size="sm" disabled={retryDisabled} onClick={onRetry}>
          Reintentar proveedores
        </Button>
      </div>
    )}
    {(description || noSuppliers) && (
      <FormDescription>
        {description}
        {noSuppliers && <span className="block">No hay proveedores disponibles.</span>}
      </FormDescription>
    )}
  </>;
}
