/** Estados físicos en los que una unidad no puede asignarse a una cotización. */
const BLOCKED_STATUSES = new Set(["maintenance", "retired", "sold", "out_of_service"]);

export function isForkliftSelectableForAssignment(
  forklift: { id: string; status: string },
  rpcAvailableIds: ReadonlySet<string> | null,
  rentedIds: ReadonlySet<string> | undefined,
): boolean {
  if (BLOCKED_STATUSES.has(forklift.status)) return false;
  if (rpcAvailableIds) return rpcAvailableIds.has(forklift.id);
  return rentedIds ? !rentedIds.has(forklift.id) : forklift.status === "available";
}
