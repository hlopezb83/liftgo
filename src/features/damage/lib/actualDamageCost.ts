interface ActualDamageCost {
  actual_cost: number | null;
  actual_cost_source?: string | null;
}

/** A default legacy zero is unknown; a recorded zero is an intentional value. */
export function hasRecordedActualCost(record: ActualDamageCost): boolean {
  const cost = Number(record.actual_cost);
  return record.actual_cost != null && Number.isFinite(cost) && cost >= 0 && (
    cost > 0 ||
    record.actual_cost_source === "manual" ||
    record.actual_cost_source === "maintenance"
  );
}
