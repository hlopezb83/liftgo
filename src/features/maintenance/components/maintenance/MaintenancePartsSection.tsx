import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { InventoryIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  useMaintenanceParts,
  useAddMaintenancePart,
  type PartInventory,
} from "@/features/inventory";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { roundMoney, sumMoney } from "@/lib/money";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { MAINTENANCE_PART_PAGE_SIZE, useMaintenancePartOptions } from "../../hooks/maintenance/useMaintenancePartOptions";
import { AddMaintenancePartForm } from "./AddMaintenancePartForm";

interface Props {
  maintenanceLogId: string;
  currentCost: number;
  /** R12-M10: cuando el OT está `completed`, la UI oculta el formulario de
   * captura. La defensa dura vive en los triggers de DB. */
  readOnly?: boolean;
}

export function MaintenancePartsSection(props: Props) {
  const identity = useVerifiedIdentityScope();
  return <MaintenancePartsSession key={JSON.stringify([identity, props.maintenanceLogId])} {...props} />;
}

function MaintenancePartsSession({ maintenanceLogId, currentCost, readOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim());

  const usedQuery = useMaintenanceParts(maintenanceLogId);
  const { data: usedParts = [], isLoading: loadingUsed } = usedQuery;
  const { pageQuery, selectedQuery, contextError } = useMaintenancePartOptions({
    open: open && !readOnly, search: debouncedSearch, page, selectedId: selectedPartId,
  });
  const addPart = useAddMaintenancePart();

  const pickerPage = pickerPageState(pageQuery, contextError, search.trim() === debouncedSearch, page);
  const { selectedPart, selectedReady } = selectionState(selectedQuery, pageQuery, selectedPartId, contextError);
  const setSelectedPart = (part: PartInventory | null) => setSelectedPartId(part?.id ?? null);
  const usedUnavailable = loadingUsed || usedQuery.isError;
  const previousConsumption = usedParts.find(part => part.part_id === selectedPartId);

  const handleAddPart = () => {
    if (readOnly || addPart.isPending || usedUnavailable || !selectedReady) return;
    if (!selectedPart) { notifyValidation({ message: "Selecciona una refacción" }); return; }
    if (quantity < 1) { notifyValidation({ message: "La cantidad debe ser al menos 1" }); return; }
    if (quantity > selectedPart.stock_quantity) {
      notifyValidation({ message: `Solo hay ${selectedPart.stock_quantity} en stock` });
      return;
    }

    addPart.mutate(
      {
        maintenance_log_id: maintenanceLogId,
        part_id: selectedPart.id,
        quantity_used: quantity,
        // Kept for the existing hook signature; the consumption RPC owns valuation.
        cost_at_time: selectedPart.unit_cost,
        currentLogCost: currentCost,
      },
      {
        onSuccess: () => {
          notifySuccess("Refacción agregada");
          setSelectedPart(null);
          setQuantity(1);
        },
      }
    );
  };

  // Ronda D·#3: acumular con sumMoney (centavos) para evitar drift IEEE-754
  // en órdenes con muchas refacciones.
  const partsCost = sumMoney(usedParts.map((p) => roundMoney(p.quantity_used * p.cost_at_time)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <InventoryIcon className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-semibold text-sm">Refacciones Utilizadas</h4>
        {!usedQuery.isError && partsCost > 0 && (
          <Badge variant="secondary" className="ml-auto">{formatCurrency(partsCost)}</Badge>
        )}
      </div>

      {!readOnly && (
        <AddMaintenancePartForm
          open={open} setOpen={setOpen}
          availableParts={pickerPage.items}
          selectedPart={selectedPart} setSelectedPart={setSelectedPart}
          quantity={quantity} setQuantity={setQuantity}
          loadingParts={!pickerPage.ready}
          search={search} onSearchChange={(value) => { setSearch(value); setPage(0); }}
          page={pickerPage.page}
          pageSize={MAINTENANCE_PART_PAGE_SIZE} totalCount={pickerPage.totalCount}
          onPageChange={setPage}
          error={pickerPage.error} retrying={pageQuery.isFetching}
          onRetry={() => { void pageQuery.refetch(); }}
          canAdd={selectedReady && !usedUnavailable}
          historicalUnitCost={previousConsumption?.cost_at_time}
          onAdd={handleAddPart}
          isAdding={addPart.isPending}
        />
      )}

      {!readOnly && <SelectedPartStatus selectedId={selectedPartId} query={selectedQuery} ready={selectedReady} />}
      <UsedPartsHistory query={usedQuery} />
    </div>
  );
}

type PickerQueries = ReturnType<typeof useMaintenancePartOptions>;
function pickerPageState(query: PickerQueries["pageQuery"], contextError: boolean, searchMatches: boolean, requestedPage: number) {
  const error = contextError || query.isError;
  if (error || !query.isSuccess || query.isFetching || !searchMatches) {
    return { ready: false, items: [], page: requestedPage, totalCount: 0, error };
  }
  return { ready: true, items: query.data.items, page: query.data.pageIndex, totalCount: query.data.totalCount, error: false };
}
function selectionState(query: PickerQueries["selectedQuery"], pageQuery: PickerQueries["pageQuery"], id: string | null, contextError: boolean) {
  const selectedPart = query.data ?? pageQuery.data?.items.find(part => part.id === id) ?? null;
  const selectedReady = !contextError && query.isSuccess && !query.isError && !query.isFetching && !!query.data && query.data.stock_quantity > 0;
  return { selectedPart, selectedReady };
}
function SelectedPartStatus({ selectedId, query, ready }: { selectedId: string | null; query: PickerQueries["selectedQuery"]; ready: boolean }) {
  if (!selectedId) return null;
  if (query.isError) return <QueryErrorState bare entity="la refacción seleccionada" error={query.error}
    isRetrying={query.isFetching} onRetry={() => { void query.refetch(); }} />;
  if (query.isSuccess && !query.isFetching && !ready) return <p className="text-sm text-destructive">La refacción ya no tiene existencias o no está disponible. Selecciona otra.</p>;
  return null;
}
function UsedPartsHistory({ query: usedQuery }: { query: ReturnType<typeof useMaintenanceParts> }) {
  const usedParts = usedQuery.data ?? [];
  return usedQuery.isError ? <QueryErrorState bare entity="las refacciones utilizadas" error={usedQuery.error}
        isRetrying={usedQuery.isFetching} onRetry={() => { void usedQuery.refetch(); }} /> : usedQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : usedParts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No se han agregado refacciones.</p>
      ) : (
        <div className="border rounded-md divide-y">
          {usedParts.map((mp) => {
            const partInfo = mp.parts_inventory as { name: string; sku: string | null; category: string } | null;
            return (
              <div key={mp.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{partInfo?.name || "Refacción"}</span>
                  {partInfo?.sku && <span className="text-xs text-muted-foreground">({partInfo.sku})</span>}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>×{mp.quantity_used}</span>
                  <span className="font-mono">{formatCurrency(mp.quantity_used * mp.cost_at_time)}</span>
                </div>
              </div>
            );
          })}
        </div>
      );
}
