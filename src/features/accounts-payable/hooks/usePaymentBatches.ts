/**
 * Query key compartido para el listado de lotes de pagos a proveedores.
 * El hook `usePaymentBatches()` que listaba los batches fue eliminado por falta
 * de consumidores; cuando se necesite una vista de historial de lotes,
 * reintroducirlo aquí reutilizando esta misma key para no duplicar caché.
 */
export const PAYMENT_BATCHES_QK = ["supplier_payment_batches"] as const;
