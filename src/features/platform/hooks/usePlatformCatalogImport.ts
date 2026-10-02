import { useQuery } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { getCatalogImportPreviewFn, importCatalogCandidateFn, listCatalogImportCandidatesFn } from "@/lib/platformCatalogImport.functions";
import type { CatalogImportInput, CatalogImportKind, CatalogImportPreviewInput, CatalogImportResult } from "@/lib/platformCatalogImport.types";
import { platformKeys } from "./usePlatformOperator";

const importKeys = {
  all: [...platformKeys.all, "catalog-import"] as const,
  list: (kind: CatalogImportKind, offset: number) => [...importKeys.all, "list", kind, offset] as const,
  preview: (input: CatalogImportPreviewInput) => [...importKeys.all, "preview", input.kind, input.source_id] as const,
};
export function useCatalogImportCandidates(kind: CatalogImportKind, offset: number) {
  return useQuery({
    queryKey: importKeys.list(kind, offset), staleTime: 0,
    queryFn: () => listCatalogImportCandidatesFn({ data: { kind, offset } }),
  });
}
export function useCatalogImportPreview(input: CatalogImportPreviewInput, enabled = true) {
  return useQuery({
    queryKey: importKeys.preview(input), enabled, staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: () => getCatalogImportPreviewFn({ data: input }),
  });
}
export function useImportCatalogCandidate() {
  return useEntityMutation<CatalogImportInput, CatalogImportResult>({
    mutationFn: (input) => importCatalogCandidateFn({ data: input }),
    invalidateKeys: [platformKeys.all],
    successMsg: "Incorporación registrada en el catálogo LiftGo",
    errorTitle: "No se pudo confirmar la incorporación",
  });
}
