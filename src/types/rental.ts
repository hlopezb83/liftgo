/**
 * Centralized View Models
 *
 * These composite types extend the auto-generated Supabase row types with
 * joined / derived fields used across multiple pages (dashboard, calendar,
 * reports, detail pages, etc.).
 *
 * Update a type here and every consumer picks up the change automatically.
 */

import type { Tables } from "@/integrations/supabase/types";

// ─── Base row aliases ────────────────────────────────────────────────────────
export type Booking = Tables<"bookings">;
export type Forklift = Tables<"forklifts">;
export type Quote = Tables<"quotes">;
export type Invoice = Tables<"invoices">;
export type DamageRecord = Tables<"damage_records">;
export type ReturnInspection = Tables<"return_inspections">;

// ─── Joined forklift snippet (reused across many views) ──────────────────────
export interface ForkliftSnippet {
  name: string;
  model: string;
}

// ─── Booking view models ─────────────────────────────────────────────────────
export type BookingWithForklift = Booking & {
  forklifts: ForkliftSnippet | null;
};

// ─── Contract view model ─────────────────────────────────────────────────────
export interface ContractViewModel {
  id: string;
  contract_number: string;
  booking_id: string | null;
  customer_id: string | null;
  forklift_id: string | null;
  start_date: string | null;
  end_date: string | null;
  daily_rate: number | null;
  weekly_rate: number | null;
  monthly_rate: number | null;
  deposit_amount: number | null;
  terms_text: string | null;
  status: string;
  signed_at: string | null;
  signed_by: string | null;
  notes: string | null;
  usage_location: string | null;
  max_hours_per_month: number | null;
  extra_hour_rate: number | null;
  payment_frequency: string | null;
  late_interest_rate: number | null;
  contract_city: string | null;
  witness_1: string | null;
  witness_2: string | null;
  created_at: string;
  updated_at: string;
  /** Joined from customers.name */
  customer_name?: string;
  /** Joined from forklifts.name */
  forklift_name?: string;
}

// ─── Return inspection view model ────────────────────────────────────────────
export type ReturnInspectionWithJoins = ReturnInspection & {
  forklifts?: ForkliftSnippet | null;
  bookings?: { customer_name: string | null; start_date?: string; end_date?: string } | null;
};

// ─── Damage record view model ────────────────────────────────────────────────
export type DamageRecordWithJoins = DamageRecord & {
  forklifts?: ForkliftSnippet | null;
  customers?: { name: string } | null;
};
