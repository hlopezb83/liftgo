import { useRef } from "react";
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
  const canClearOnError = isError && allowEmpty && !required && !disabled;
  const options = suppliers ?? [];
  const placeholder = isLoading ? "Cargando…" : "Seleccionar proveedor";
  const requiredMark = required && <RequiredMark />;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const rawValue = (field.value as string | null | undefined) ?? "";
        const value = rawValue === "" && allowEmpty ? EMPTY : rawValue;
        const unknownSelection = rawValue && !options.some((supplier) => supplier.id === rawValue);
        return (
          <FormItem className={className}>
            <FormLabel>
              {label}
              {requiredMark}
            </FormLabel>
            <Select
              value={value}
              onValueChange={(v) => field.onChange(v === EMPTY ? null : v)}
              disabled={unavailable || field.disabled}
            >
              <FormControl>
                <SelectTrigger aria-required={required || undefined}>
                  <SelectValue placeholder={placeholder}>
                    {unknownSelection ? "Proveedor seleccionado" : undefined}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {allowEmpty && <SelectItem value={EMPTY}>Sin proveedor</SelectItem>}
                {options.map((s) => (
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
              retryDisabled={disabled || field.disabled || isFetching}
              onClear={canClearOnError && !field.disabled && rawValue
                ? () => field.onChange(null) : undefined}
              onRetry={() => { void refetch(); }}
            />
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function SupplierOptionsStatus({ description, noSuppliers, isError, retryDisabled, onRetry, onClear }: {
  description?: string;
  noSuppliers: boolean;
  isError: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
  onClear?: () => void;
}) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  return <>
    {isError && (
      <div className="flex flex-wrap items-center gap-2">
        <p ref={errorRef} role="alert" tabIndex={-1} className="text-xs text-destructive">No se pudo cargar el catálogo de proveedores.</p>
        <Button type="button" variant="outline" size="sm" disabled={retryDisabled} onClick={onRetry}>
          Reintentar proveedores
        </Button>
        {onClear && (
          <Button type="button" variant="outline" size="sm" onClick={() => {
            errorRef.current?.focus();
            onClear();
          }}>
            Quitar proveedor
          </Button>
        )}
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
