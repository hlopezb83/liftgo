export interface MaintenancePolicyFormValues {
  forklift_id: string;
  provider_name: string;
  monthly_cost: string;
  service_type: string;
  description: string;
}

export const EMPTY_POLICY_FORM: MaintenancePolicyFormValues = {
  forklift_id: "",
  provider_name: "",
  monthly_cost: "",
  service_type: "Póliza de Mantenimiento",
  description: "",
};
