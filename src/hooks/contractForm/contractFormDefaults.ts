export const defaultContractForm = {
  customer_id: "",
  forklift_id: "",
  start_date: "",
  end_date: "",
  daily_rate: "0",
  weekly_rate: "0",
  monthly_rate: "0",
  deposit_amount: "0",
  terms_text: "",
  signed_by: "",
  notes: "",
  usage_location: "",
  max_hours_per_month: "",
  extra_hour_rate: "",
  payment_frequency: "Mensual",
  late_interest_rate: "5",
  contract_city: "San Pedro Garza García, N.L.",
  witness_1: "",
  witness_2: "",
};

export type ContractFormShape = typeof defaultContractForm;
