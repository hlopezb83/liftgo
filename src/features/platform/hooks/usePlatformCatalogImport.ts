import { useQuery } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import {
  getCatalogImportPreviewFn,
  importCatalogCandidateFn,
  listCatalogImportCandidatesFn,
} from "../lib/platformCatalogImport.functions";
import { platformKeys } from "../lib/queryKeys";
import type {
  CatalogImportInput,
  CatalogImportKind,
  CatalogImportPreviewInput,
  CatalogImportResult,
} from "../lib/platformCatalogImport.types";

export function useCatalogImportCandidates(kind: CatalogImportKind, offset: number) {
  return useQuery({
    queryKey: platformKeys.catalogImport.list(kind, offset),
    staleTime: 0,
    queryFn: () => listCatalogImportCandidatesFn({ data: { kind, offset } }),
  });
}

export function useCatalogImportPreview(input: CatalogImportPreviewInput, enabled = true) {
  return useQuery({
    queryKey: platformKeys.catalogImport.preview(input),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
