/**
 * Fixtures mínimas pero realistas para tests de smoke de los Documents PDF.
 * Mantenerlas chicas: solo se busca verificar que el árbol React se construye
 * y contiene los campos clave. No reflejan necesariamente datos válidos del SAT.
 */
import { emptyExpenses } from "@/features/reports/hooks/incomeStatement/types";
import type {
  StatementRow, ComparisonRow, YearTotals, MonthData,
} from "@/features/reports/hooks/useIncomeStatementData";
import type { CustomerSummary } from "@/lib/domain/customerTypes";
import type { ContractData, TemplateData } from "@/lib/pdf/contract/data";
import type { CompanyData, PdfLineItem } from "@/lib/pdf/shared";

export const company: CompanyData = {
  razon_social: "LiftGo Demo SA de CV",
  rfc: "LDE260101AAA",
  regimen_fiscal: "601",
  lugar_expedicion: "64000",
  logo_url: null,
};

export const lineItems: PdfLineItem[] = [
  { description: "Renta mensual", quantity: 1, unit_price: 10_000, total: 10_000 },
  { description: "Renta diaria", quantity: 3, unit_price: 500, total: 1_500 },
];

export const totals = { subtotal: 11_500, taxRate: 16, taxAmount: 1_840, total: 13_340 };

export const customerSummary: CustomerSummary = {
  bookings: [],
  invoices: [
    {
      id: "i-1",
      invoice_number: "FAC-0001",
      issued_at: "2026-01-01",
      due_date: "2026-01-31",
      total: 1_000,
      status: "sent",
      currency: "MXN",
      tipo_cambio: 1,
    },
    {
      id: "i-2",
      invoice_number: "FAC-0002",
      issued_at: "2026-02-01",
      due_date: "2026-02-28",
      total: 500,
      status: "paid",
      currency: "USD",
      tipo_cambio: 18,
    },
  ],
  totals: { total_invoiced: 10_000, total_paid: 9_000 },
};

const month: MonthData = {
  monthKey: "2026-01",
  month: "ene",
  revenue: 10_000,
  revenueRentalBooked: 8_000, revenueRentalUnbooked: 0,
  revenueSales: 2_000,
  revenueDamageRecovery: 0,
  maintenanceCost: 1_000,
  damageCost: 0,
  depreciation: 500,
  depreciationRented: 400,
  depreciationIdle: 100,
  cogsForkliftSales: 0,
  cogsByForklift: {},
  depreciationByForklift: {},
  rentalBookedByCustomer: {},
  rentalUnbookedByCustomer: {},
  salesByCustomer: {},
  damageRecoveryByCustomer: {},

  grossProfit: 9_000,
  grossMargin: 90,
  expenses: { ...emptyExpenses(), nomina: 1_000 },
  expensesDetailByCategory: {},
  totalExpenses: 2_000,
  profitBeforeDepreciation: 8_000,
  marginBeforeDepreciation: 80,
  netProfit: 7_500,
  margin: 75,
};

export const incomeStatement = {
  filteredData: [month],
  statementRows: [
    { label: "Ingresos", values: [10_000], total: 10_000, isSubtotal: true },
    { label: "Costos", values: [-1_000], total: -1_000, isCost: true },
  ] satisfies StatementRow[],
  comparisonRows: [
    { label: "Ingresos", yearValues: [10_000, 12_000], delta: 2_000, deltaPct: 20, isSubtotal: true },
    { label: "Margen", yearValues: [80, 85], delta: 5, deltaPct: null, isPercent: true },
  ] satisfies ComparisonRow[],
  yearTotals: [
    {
      year: "2025",
      revenue: 100_000, revenueRentalBooked: 80_000, revenueRentalUnbooked: 0, revenueSales: 20_000, revenueDamageRecovery: 0,
      maintenanceCost: 10_000, damageCost: 0, depreciation: 5_000, depreciationRented: 4_000, depreciationIdle: 1_000, cogsForkliftSales: 0,
      expenses: { ...emptyExpenses(), nomina: 12_000 },
      grossProfit: 90_000, grossMargin: 90, totalExpenses: 22_000,
      profitBeforeDepreciation: 78_000, marginBeforeDepreciation: 78,
      netProfit: 73_000, margin: 73,
    },
  ] satisfies YearTotals[],
};

export const contract: ContractData = {
  contract_number: "CTR-0001",
  customer_id: "c-1",
  forklift_id: "f-1",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  daily_rate: 500,
  weekly_rate: 2_000,
  monthly_rate: 10_000,
  deposit_amount: 5_000,
  terms_text: null,
  status: "active",
  signed_at: null,
  signed_by: null,
  usage_location: "Monterrey, NL",
  max_hours_per_month: 200,
  extra_hour_rate: 100,
  payment_frequency: "monthly",
  late_interest_rate: 2,
  contract_city: "Monterrey",
  witness_1: "Testigo Uno",
  witness_2: "Testigo Dos",
  customer_name: "Cliente Demo SA",
};

export const template: TemplateData = {
  intro_text: "Intro del contrato.",
  declarations_landlord: ["Declara el arrendador..."],
  declarations_tenant: ["Declara el arrendatario..."],
  clauses: [{ title: "PRIMERA", body: "Objeto del contrato." }],
  checklist_sections: [{ title: "Estructura", items: ["Chasis", "Mástil"] }],

  pagare_text: "Pagaré demo.",
};
