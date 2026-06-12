/**
 * API pública de la feature `fleet`.
 */
export { forkliftKeys, equipmentModelKeys, driverKeys, insuranceAlertKeys } from "./lib/queryKeys";
export {
  useForklifts,
  useForklift,
  useStatusLogs,
  useCreateForklift,
  useUpdateForklift,
  useDeleteForklift,
  useUpdateStatus,
  type Forklift,
} from "./hooks/forklifts/useForklifts";
