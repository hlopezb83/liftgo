/**
 * Query key factory para la feature `crm` (oportunidades, etapas, actividades).
 */
export const dealKeys = {
  all: ["deals"] as const,
  lists: () => [...dealKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...dealKeys.lists(), filters] as const,
  details: () => [...dealKeys.all, "detail"] as const,
  detail: (id: string) => [...dealKeys.details(), id] as const,
  byStage: (stage: string) => [...dealKeys.all, "stage", stage] as const,
  closed: (filters: Record<string, unknown>) =>
    [...dealKeys.all, "closed", filters] as const,
} as const;

export const dealActivityKeys = {
  all: ["deal_activities"] as const,
  byDeal: (dealId: string) => [...dealActivityKeys.all, dealId] as const,
} as const;
