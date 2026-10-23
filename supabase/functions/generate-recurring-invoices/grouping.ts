type GroupablePlanItem = {
  organizationId: string;
  customerId: string;
  startStr: string;
  endStr: string;
  currency: string;
  tipoCambio: number;
};

/** Never combine tenants, periods, currencies or agreed exchange rates. */
export function groupPlanItems<T extends GroupablePlanItem>(
  items: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key =
      `${item.organizationId}|${item.customerId}|${item.startStr}|${item.endStr}|${item.currency}|${item.tipoCambio}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}
