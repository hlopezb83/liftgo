// Barrel público de la feature "deliveries".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { deliveryKeys, deliveryQueries, useCreateDelivery } from "./hooks/useDeliveries";

export { deliveryBookingDateError } from "./lib/deliveryBookingDate";
export { type HistoricalDeliveryLike, type HistoricalReconciliation, isHistoricallyReconciled } from "./lib/historicalReconciliation";
export { DeliveryFormDialog, type DeliveryBookingContext } from "./components/DeliveryFormDialog";
